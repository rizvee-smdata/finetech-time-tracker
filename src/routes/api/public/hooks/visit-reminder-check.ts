import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Visit-entry reminder cron hook.
 * Called by pg_cron twice per working day (10:00 and 18:00).
 * For each company member, checks whether they logged any customer_visit
 * for the previous working day (skipping Fridays + company_holidays).
 * If not, creates an in-app reminder + an entry in visit_reminder_log,
 * and queues a transactional email (best-effort).
 */
export const Route = createFileRoute("/api/public/hooks/visit-reminder-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-cron-secret");
        if (!secret || secret !== process.env.CRON_SECRET) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let body: { channel?: string } = {};
        try { body = await request.json(); } catch { /* empty body ok */ }
        const channel: "morning" | "evening" =
          body.channel === "evening" ? "evening" : "morning";

        const today = new Date();
        // Skip if today is itself non-working (Friday or holiday) — no reminder needed.
        const dow = today.getUTCDay();

        // Get all (company_id, user_id) memberships, joined with profile email/name
        const { data: members, error: memErr } = await supabaseAdmin
          .from("company_members")
          .select("company_id, user_id, profiles:profiles!company_members_user_fk(full_name, email)");
        if (memErr) {
          return new Response(JSON.stringify({ error: memErr.message }), { status: 500 });
        }

        // Group by company to compute previous working day once per company
        const byCompany = new Map<string, typeof members>();
        for (const m of members ?? []) {
          const arr = byCompany.get(m.company_id) ?? [];
          arr.push(m as any);
          byCompany.set(m.company_id, arr);
        }

        const todayISO = today.toISOString().slice(0, 10);
        let processed = 0;
        let alerted = 0;

        for (const [companyId, list] of byCompany) {
          // compute previous working day via SQL helper
          const { data: pwdRes, error: pwdErr } = await supabaseAdmin
            .rpc("previous_working_day", { _company: companyId, _from: todayISO });
          if (pwdErr || !pwdRes) continue;
          const targetDate: string = pwdRes as string;

          // If today is a holiday/Friday — still send reminder for the PREVIOUS workday
          // (the day they should have logged). Skip nothing.

          for (const m of list as any[]) {
            processed++;

            // Did user log ANY visit on targetDate?
            const dayStart = `${targetDate}T00:00:00Z`;
            const dayEnd = `${targetDate}T23:59:59.999Z`;
            const { count } = await supabaseAdmin
              .from("customer_visits")
              .select("id", { count: "exact", head: true })
              .eq("user_id", m.user_id)
              .gte("meeting_at", dayStart)
              .lte("meeting_at", dayEnd);

            if ((count ?? 0) > 0) continue;

            // Already sent this channel today?
            const { data: existing } = await supabaseAdmin
              .from("visit_reminder_log")
              .select("id, in_app_sent_at, email_sent_at")
              .eq("user_id", m.user_id)
              .eq("target_date", targetDate)
              .eq("channel", channel)
              .maybeSingle();
            if (existing) continue;

            const recipient = m.profiles?.email as string | undefined;
            const name = (m.profiles?.full_name as string | undefined) ?? recipient ?? "there";

            const title = channel === "morning"
              ? `Please log your visits from ${targetDate}`
              : `Reminder: visit entries for ${targetDate} are still missing`;
            const bodyText =
              `You haven't logged any customer visits for ${targetDate}. ` +
              `Please open Visits → New Visit and add your entries.`;

            // 1) In-app notification via reminders table
            await supabaseAdmin.from("reminders").insert({
              user_id: m.user_id,
              company_id: companyId,
              title,
              body: bodyText,
              remind_at: new Date().toISOString(),
              category: "general",
              link_url: "/visits/new",
              metadata: { kind: "visit_entry_missing", target_date: targetDate, channel },
            });

            // 2) Log entry
            const { data: logRow } = await supabaseAdmin
              .from("visit_reminder_log")
              .insert({
                user_id: m.user_id,
                company_id: companyId,
                target_date: targetDate,
                channel,
                in_app_sent_at: new Date().toISOString(),
              })
              .select("id")
              .single();

            // 3) Email — best effort (fails silently if email infra not yet scaffolded)
            if (recipient) {
              try {
                const origin = new URL(request.url).origin;
                const res = await fetch(`${origin}/lovable/email/transactional/send`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-internal-cron": process.env.CRON_SECRET ?? "",
                  },
                  body: JSON.stringify({
                    templateName: "visit-entry-reminder",
                    recipientEmail: recipient,
                    idempotencyKey: `visit-reminder-${m.user_id}-${targetDate}-${channel}`,
                    templateData: { name, targetDate, channel, appUrl: origin },
                  }),
                });
                if (res.ok && logRow) {
                  await supabaseAdmin
                    .from("visit_reminder_log")
                    .update({ email_sent_at: new Date().toISOString() })
                    .eq("id", logRow.id);
                }
              } catch {
                // Email infra may not be configured yet — banner still fires.
              }
            }

            alerted++;
          }
        }

        return new Response(
          JSON.stringify({ ok: true, channel, processed, alerted, dow }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
