// Core sync engine (server-only).
import {
  getFreshToken,
  searchGmail,
  getGmailMessage,
  buildContactQuery,
} from "./gmail.server";

type SyncOpts = {
  userId: string;
  leadId?: string;
  scope: "user" | "lead" | "scheduled";
};

export async function runSync(opts: SyncOpts): Promise<{ newEmails: number; error?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: logRow } = await supabaseAdmin
    .from("gmail_sync_logs")
    .insert({ user_id: opts.userId, scope: opts.scope, status: "running" })
    .select("id")
    .single();
  const logId = logRow?.id;

  const finish = async (status: "ok" | "error", newEmails: number, err?: string) => {
    if (logId) {
      await supabaseAdmin
        .from("gmail_sync_logs")
        .update({
          finished_at: new Date().toISOString(),
          new_emails: newEmails,
          status,
          error_message: err ?? null,
        })
        .eq("id", logId);
    }
    if (status === "ok") {
      await supabaseAdmin
        .from("gmail_accounts")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("user_id", opts.userId);
    }
  };

  const token = await getFreshToken(supabaseAdmin, opts.userId);
  if (!token) {
    await finish("error", 0, "no_token_or_disconnected");
    return { newEmails: 0, error: "no_token_or_disconnected" };
  }

  // Load leads to sync
  let leadsQ = supabaseAdmin
    .from("crm_leads")
    .select("id,created_at,stage,assigned_to")
    .not("stage", "in", "(won,lost)");
  if (opts.leadId) leadsQ = leadsQ.eq("id", opts.leadId);
  const { data: leads } = await leadsQ;
  if (!leads?.length) {
    await finish("ok", 0);
    return { newEmails: 0 };
  }

  let totalNew = 0;
  try {
    for (const lead of leads) {
      const { data: contacts } = await supabaseAdmin
        .from("lead_contacts")
        .select("email")
        .eq("lead_id", lead.id);
      const emails = (contacts ?? []).map((c: any) => c.email).filter(Boolean);
      if (!emails.length) continue;

      const queries = buildContactQuery(emails, 180);
      const messageIds = new Set<string>();
      for (const q of queries) {
        try {
          const ids = await searchGmail(token.accessToken, q, 50);
          ids.forEach((id) => messageIds.add(id));
        } catch (e: any) {
          if (String(e?.message).includes("rate_limited")) throw new Error("rate_limited");
          throw e;
        }
      }

      // Filter out ids we already have for this lead
      const existing = new Set<string>();
      if (messageIds.size) {
        const { data: existingRows } = await supabaseAdmin
          .from("lead_emails")
          .select("gmail_message_id")
          .eq("lead_id", lead.id)
          .in("gmail_message_id", Array.from(messageIds));
        (existingRows ?? []).forEach((r: any) => existing.add(r.gmail_message_id));
      }
      const toFetch = Array.from(messageIds).filter((id) => !existing.has(id));

      const leadCreatedMinus30 = new Date(new Date(lead.created_at).getTime() - 30 * 86400_000);
      const inserted: Array<{ from_email: string; subject: string }> = [];
      let inboundNew = 0;
      for (const id of toFetch) {
        try {
          const msg = await getGmailMessage(token.accessToken, id);
          if (new Date(msg.sentAt) < leadCreatedMinus30) continue;
          const direction = msg.from === token.gmailAddress ? "outbound" : "inbound";
          const { error: insErr } = await supabaseAdmin.from("lead_emails").insert({
            lead_id: lead.id,
            account_user_id: opts.userId,
            gmail_message_id: msg.id,
            gmail_thread_id: msg.threadId,
            direction,
            from_email: msg.from,
            to_emails: msg.to,
            subject: msg.subject,
            snippet: msg.snippet,
            sent_at: msg.sentAt,
            has_attachments: msg.hasAttachments,
            body_preview: msg.bodyPreview,
          });
          if (!insErr) {
            totalNew++;
            if (direction === "inbound") {
              inboundNew++;
              inserted.push({ from_email: msg.from, subject: msg.subject });
            }
          }
        } catch (e: any) {
          if (String(e?.message).includes("rate_limited")) throw new Error("rate_limited");
          // continue on per-message errors
        }
        // gentle pacing
        await new Promise((r) => setTimeout(r, 60));
      }

      // Notify lead assignee about new inbound emails (only for scheduled/user syncs)
      if (opts.scope !== "lead" && inboundNew > 0 && lead.assigned_to) {
        await supabaseAdmin.from("gmail_notifications").insert({
          user_id: lead.assigned_to,
          lead_id: lead.id,
          count: inboundNew,
          sample_from: inserted[0]?.from_email ?? null,
          sample_subject: inserted[0]?.subject ?? null,
        });
      }
    }
    await finish("ok", totalNew);
    return { newEmails: totalNew };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    await finish("error", totalNew, msg);
    return { newEmails: totalNew, error: msg };
  }
}
