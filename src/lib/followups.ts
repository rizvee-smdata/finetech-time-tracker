import { supabase } from "@/integrations/supabase/client";

export type Followup = {
  id: string;
  company_id: string;
  rep_id: string;
  lead_id: string | null;
  account_id: string | null;
  contact_name: string;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  last_contact_at: string | null;
  last_interaction_type: string | null;
  days_overdue: number;
  open_deal_value: number | null;
  currency: string;
  priority_score: number;
  suggested_channel: "whatsapp" | "email";
  ai_draft: string | null;
  ai_subject: string | null;
  ai_draft_generated_at: string | null;
  status: "open" | "snoozed" | "dismissed" | "sent";
  snoozed_until: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

const PROJECT_ID = (import.meta.env.VITE_SUPABASE_PROJECT_ID as string) || "ejiaxmvzolqgfcawgyvl";

export async function generateFollowupDraft(args: {
  rep_name: string;
  contact_name: string;
  company: string;
  days_since_contact: number;
  last_interaction_type?: string;
  deal_context?: string;
  channel?: "whatsapp" | "email";
  language?: "en" | "bn";
}) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  const res = await fetch(`https://${PROJECT_ID}.functions.supabase.co/generate-followup-draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Draft failed (${res.status})`);
  return data as { channel: string; message: string; subject?: string };
}

export async function sendFollowupEmail(args: {
  recipientEmail: string;
  recipientName: string;
  repName: string;
  subject: string;
  message: string;
  idempotencyKey: string;
}) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  const res = await fetch("/lovable/email/transactional/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      templateName: "followup",
      recipientEmail: args.recipientEmail,
      idempotencyKey: args.idempotencyKey,
      subject: args.subject,
      fromName: args.repName,
      templateData: {
        recipientName: args.recipientName,
        repName: args.repName,
        message: args.message,
      },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Email send failed (${res.status}): ${t.slice(0, 200)}`);
  }
  return await res.json().catch(() => ({}));
}

export function whatsappLink(phone: string, message: string) {
  const digits = phone.replace(/[^\d]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function priorityClass(score: number) {
  if (score >= 75) return "bg-red-500/15 text-red-700 border-red-200";
  if (score >= 50) return "bg-amber-500/15 text-amber-700 border-amber-200";
  return "bg-emerald-500/15 text-emerald-700 border-emerald-200";
}

/**
 * Build follow-up rows from currently overdue leads for the signed-in rep.
 * Idempotent: upserts on (rep_id, lead_id) by checking existing open rows.
 */
export async function syncMyFollowups(companyId: string, repId: string) {
  // Load company settings
  const { data: settings } = await supabase
    .from("followup_settings" as never)
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  const inactivityDays = (settings as any)?.inactivity_threshold_days ?? 7;
  const highValueThreshold = Number((settings as any)?.high_value_threshold ?? 100000);
  const highValueBoost = (settings as any)?.high_value_boost ?? 25;
  const blackout: string[] = (settings as any)?.blackout_dates ?? [];
  const defaultChannel = ((settings as any)?.default_channel ?? "whatsapp") as "whatsapp" | "email";

  const today = new Date().toISOString().slice(0, 10);
  if (blackout.includes(today)) return { created: 0, skipped: "blackout" };

  const cutoff = new Date(Date.now() - inactivityDays * 86400000).toISOString();

  const { data: leads, error } = await supabase
    .from("crm_leads")
    .select("id, customer_name, company_name, contact_person, phone, email, last_activity_at, expected_value, currency, stage, account_id")
    .eq("assigned_to", repId)
    .eq("company_id", companyId)
    .not("stage", "in", "(won,lost)")
    .lt("last_activity_at", cutoff)
    .limit(100);
  if (error) throw error;

  const { data: existing } = await supabase
    .from("followups" as never)
    .select("lead_id, status")
    .eq("rep_id", repId)
    .in("status", ["open", "snoozed"]);
  const existingLeadIds = new Set((existing ?? []).map((r: any) => r.lead_id));

  const rows: any[] = [];
  for (const l of leads ?? []) {
    if (existingLeadIds.has(l.id)) continue;
    const lastAt = l.last_activity_at ? new Date(l.last_activity_at) : null;
    const days = lastAt ? Math.floor((Date.now() - lastAt.getTime()) / 86400000) : 999;
    let score = 30 + Math.min(50, days * 2);
    if (Number(l.expected_value ?? 0) >= highValueThreshold) score += highValueBoost;
    score = Math.min(100, score);

    const channel: "whatsapp" | "email" = l.phone ? defaultChannel : (l.email ? "email" : defaultChannel);

    rows.push({
      company_id: companyId,
      rep_id: repId,
      lead_id: l.id,
      account_id: l.account_id,
      contact_name: l.contact_person ?? l.customer_name,
      company_name: l.company_name,
      phone: l.phone,
      email: l.email,
      last_contact_at: l.last_activity_at,
      last_interaction_type: "CRM activity",
      days_overdue: days,
      open_deal_value: l.expected_value,
      currency: l.currency ?? "BDT",
      priority_score: score,
      suggested_channel: channel,
      status: "open",
    });
  }

  if (!rows.length) return { created: 0 };
  const { error: insErr } = await supabase.from("followups" as never).insert(rows as never);
  if (insErr) throw insErr;
  return { created: rows.length };
}
