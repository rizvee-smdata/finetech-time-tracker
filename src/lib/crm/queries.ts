import { supabase } from "@/integrations/supabase/client";
import type { CrmStage, Lead, LeadActivity, Quote } from "./types";

// Use `any` shims since auto-generated Supabase types may lag behind the migration.
const sb = supabase as unknown as {
  from: (t: string) => any;
};

export async function fetchLeads(params: {
  companyId: string;
  stage?: CrmStage | null;
  assignedTo?: string | null;
  search?: string | null;
}): Promise<Lead[]> {
  let q = sb
    .from("crm_leads")
    .select("*")
    .eq("company_id", params.companyId)
    .order("last_activity_at", { ascending: false });
  if (params.stage) q = q.eq("stage", params.stage);
  if (params.assignedTo) q = q.eq("assigned_to", params.assignedTo);
  if (params.search) q = q.ilike("customer_name", `%${params.search}%`);
  const { data, error } = await q;
  if (error) throw error;
  const leads = (data ?? []) as Lead[];
  const userIds = Array.from(new Set(leads.map((l) => l.assigned_to).filter(Boolean))) as string[];
  if (userIds.length) {
    const { data: profs } = await sb.from("profiles").select("id, full_name, email").in("id", userIds);
    const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
    for (const l of leads) l.assignee = (l.assigned_to ? map.get(l.assigned_to) : null) ?? null;
  }
  return leads;
}

export async function fetchLead(id: string): Promise<Lead | null> {
  const { data, error } = await sb.from("crm_leads").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const lead = data as Lead;
  if (lead.assigned_to) {
    const { data: prof } = await sb.from("profiles").select("id, full_name, email").eq("id", lead.assigned_to).maybeSingle();
    lead.assignee = prof ?? null;
  }
  return lead;
}

export async function updateLeadStage(id: string, stage: CrmStage, lost_reason?: string) {
  const patch: Record<string, unknown> = { stage };
  if (stage === "lost" && lost_reason) patch.lost_reason = lost_reason;
  const { error } = await sb.from("crm_leads").update(patch).eq("id", id);
  if (error) throw error;
}

export async function fetchActivities(leadId: string): Promise<LeadActivity[]> {
  const { data, error } = await sb
    .from("crm_lead_activities")
    .select("*")
    .eq("lead_id", leadId)
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as LeadActivity[];
}

export async function addActivity(input: {
  lead_id: string;
  activity_type: "note" | "call" | "email" | "meeting";
  title: string;
  body?: string;
  user_id: string;
}) {
  const { error } = await sb.from("crm_lead_activities").insert(input);
  if (error) throw error;
}

export async function fetchQuotes(leadId: string): Promise<Quote[]> {
  const { data, error } = await sb
    .from("crm_quotes")
    .select("*")
    .eq("lead_id", leadId)
    .order("version", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Quote[];
}

export async function fetchAttachments(leadId: string) {
  const { data, error } = await sb
    .from("crm_lead_attachments")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchLeadTasks(leadId: string) {
  const { data, error } = await sb
    .from("tms_tasks")
    .select("*, tms_task_statuses(name, color, is_terminal)")
    .eq("lead_id", leadId)
    .is("deleted_at", null)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchCompanyMembers(companyId: string) {
  const { data: mem } = await sb.from("company_members").select("user_id").eq("company_id", companyId);
  const ids = (mem ?? []).map((m: any) => m.user_id);
  if (!ids.length) return [] as { id: string; full_name: string | null; email: string | null }[];
  const { data: profs } = await sb.from("profiles").select("id, full_name, email").in("id", ids);
  return (profs ?? []) as { id: string; full_name: string | null; email: string | null }[];
}

export async function convertVisitToLead(visit: any, userId: string): Promise<string> {
  // Avoid duplicates
  const { data: existing } = await sb.from("crm_leads").select("id").eq("source_visit_id", visit.id).maybeSingle();
  if (existing?.id) return existing.id as string;

  const payload = {
    company_id: visit.company_id,
    source: "visit",
    source_visit_id: visit.id,
    customer_name: visit.customer_name,
    company_name: visit.company,
    contact_person: visit.customer_name,
    designation: visit.designation,
    phone: visit.contact_number,
    email: visit.email,
    location: visit.location,
    notes: visit.discussion_summary,
    assigned_to: visit.user_id ?? userId,
    created_by: userId,
    stage: "new" as CrmStage,
  };
  const { data, error } = await sb.from("crm_leads").insert(payload).select("id").single();
  if (error) throw error;
  return data.id as string;
}
