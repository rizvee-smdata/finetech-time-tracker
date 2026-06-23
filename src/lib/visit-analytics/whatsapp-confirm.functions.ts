import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type UpcomingVisit = {
  visit_id: string;
  customer_name: string;
  company: string | null;
  contact_number: string | null;
  meeting_at: string;
  user_id: string;
  rep_name: string | null;
  already_confirmed: boolean;
};

/** WhatsApp visit confirmations — list upcoming visits in the next 24h. */
export const getVisitsAwaitingConfirmation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { hours?: number } | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<{ visits: UpcomingVisit[] }> => {
    const { supabase } = context;
    const hours = data.hours ?? 24;
    const now = new Date();
    const horizon = new Date(now.getTime() + hours * 3600 * 1000).toISOString();

    const [{ data: visits }, { data: profiles }, { data: logs }] = await Promise.all([
      supabase
        .from("customer_visits")
        .select("id, customer_name, company, contact_number, meeting_at, user_id")
        .gte("meeting_at", now.toISOString())
        .lte("meeting_at", horizon)
        .order("meeting_at", { ascending: true }),
      supabase.from("profiles").select("id, full_name, email"),
      supabase
        .from("whatsapp_message_log")
        .select("metadata, template_key, status")
        .eq("template_key", "visit_confirmation")
        .gte("created_at", new Date(now.getTime() - 7 * 86400000).toISOString()),
    ]);

    const profileMap = new Map(
      (profiles ?? []).map((p) => [p.id, p.full_name || p.email || "Rep"]),
    );

    const confirmed = new Set<string>();
    (logs ?? []).forEach((l) => {
      const visitId = (l.metadata as { visit_id?: string } | null)?.visit_id;
      if (visitId && (l.status === "sent" || l.status === "queued")) {
        confirmed.add(visitId);
      }
    });

    const rows: UpcomingVisit[] = (visits ?? []).map((v) => ({
      visit_id: v.id,
      customer_name: v.customer_name,
      company: v.company,
      contact_number: v.contact_number,
      meeting_at: v.meeting_at,
      user_id: v.user_id,
      rep_name: profileMap.get(v.user_id) ?? null,
      already_confirmed: confirmed.has(v.id),
    }));

    return { visits: rows };
  });

/** Queue a WhatsApp confirmation message for a visit. Dispatch handled by WATI worker. */
export const queueVisitConfirmation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { visit_id: string }) => input)
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    const { supabase, userId } = context;

    const { data: visit, error: vErr } = await supabase
      .from("customer_visits")
      .select("id, company_id, customer_name, company, contact_number, meeting_at")
      .eq("id", data.visit_id)
      .maybeSingle();

    if (vErr || !visit) return { ok: false, error: vErr?.message ?? "Visit not found" };
    if (!visit.contact_number) return { ok: false, error: "No contact number on visit" };

    const meetingDate = new Date(visit.meeting_at);
    const when = meetingDate.toLocaleString("en-GB", {
      timeZone: "Asia/Dhaka",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
    const body =
      `Hi ${visit.customer_name}, this is a reminder of our scheduled meeting on ${when}` +
      (visit.company ? ` regarding ${visit.company}` : "") +
      `. Please reply YES to confirm or NO to reschedule. Thank you!`;

    const { error: insErr } = await supabase.from("whatsapp_message_log").insert({
      company_id: visit.company_id,
      user_id: userId,
      direction: "outbound",
      template_key: "visit_confirmation",
      phone: visit.contact_number,
      body,
      status: "queued",
      metadata: { visit_id: visit.id, queued_by: userId },
    });

    if (insErr) return { ok: false, error: insErr.message };
    return { ok: true };
  });
