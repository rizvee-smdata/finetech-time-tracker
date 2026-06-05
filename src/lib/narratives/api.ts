import { supabase } from "@/integrations/supabase/client";
import type {
  NarrativeReportRow,
  NarrativeSettingsRow,
  NarrativeRole,
  NarrativeChannel,
  NarrativeLanguage,
} from "./types";
import { DEFAULT_ROLE_PROMPTS } from "./types";

const sb = supabase as unknown as { from: (t: string) => any };

export async function listNarratives(companyId: string, limit = 50): Promise<NarrativeReportRow[]> {
  const { data } = await sb
    .from("narrative_reports")
    .select("*")
    .eq("company_id", companyId)
    .order("week_start", { ascending: false })
    .limit(limit);
  return (data as NarrativeReportRow[]) ?? [];
}

export async function getNarrative(id: string): Promise<NarrativeReportRow | null> {
  const { data } = await sb.from("narrative_reports").select("*").eq("id", id).maybeSingle();
  return (data as NarrativeReportRow) ?? null;
}

export async function listSettings(companyId: string): Promise<NarrativeSettingsRow[]> {
  const { data } = await sb
    .from("narrative_settings")
    .select("*")
    .eq("company_id", companyId)
    .order("role");
  return (data as NarrativeSettingsRow[]) ?? [];
}

export async function upsertSettings(
  companyId: string,
  role: NarrativeRole,
  patch: Partial<Omit<NarrativeSettingsRow, "id" | "company_id" | "role" | "created_at" | "updated_at">>,
) {
  const existing = (await listSettings(companyId)).find((s) => s.role === role);
  const base = existing ?? {
    enabled: true,
    role_description: DEFAULT_ROLE_PROMPTS[role],
    channels: ["in_app"] as NarrativeChannel[],
    delivery_time: "07:00",
    language: "en" as NarrativeLanguage,
    custom_kpis: [],
    whatsapp_recipients: [],
    email_recipients: [],
  };
  const next = { ...base, ...patch, company_id: companyId, role };
  const { data, error } = await sb
    .from("narrative_settings")
    .upsert(next, { onConflict: "company_id,role" })
    .select("*")
    .single();
  if (error) throw error;
  return data as NarrativeSettingsRow;
}

export async function findCompanion(
  companyId: string,
  weekStart: string,
  role: NarrativeRole,
): Promise<NarrativeReportRow | null> {
  // last month same week
  const start = new Date(weekStart);
  start.setDate(start.getDate() - 28);
  const target = start.toISOString().slice(0, 10);
  const { data } = await sb
    .from("narrative_reports")
    .select("*")
    .eq("company_id", companyId)
    .eq("role", role)
    .eq("week_start", target)
    .maybeSingle();
  return (data as NarrativeReportRow) ?? null;
}
