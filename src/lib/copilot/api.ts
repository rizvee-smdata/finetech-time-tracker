import { supabase } from "@/integrations/supabase/client";
import type {
  CopilotAnomalyRow,
  CopilotConversationRow,
  CopilotMessageRow,
  CopilotScheduledReportRow,
} from "./types";

const sb = supabase as unknown as { from: (t: string) => any };

export async function listConversations(userId: string): Promise<CopilotConversationRow[]> {
  const { data } = await sb
    .from("copilot_conversations")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  return (data as CopilotConversationRow[]) ?? [];
}

export async function createConversation(companyId: string, userId: string, title = "New conversation") {
  const { data, error } = await sb
    .from("copilot_conversations")
    .insert({ company_id: companyId, user_id: userId, title })
    .select("*")
    .single();
  if (error) throw error;
  return data as CopilotConversationRow;
}

export async function renameConversation(id: string, title: string) {
  await sb.from("copilot_conversations").update({ title }).eq("id", id);
}

export async function deleteConversation(id: string) {
  await sb.from("copilot_conversations").delete().eq("id", id);
}

export async function listMessages(conversationId: string): Promise<CopilotMessageRow[]> {
  const { data } = await sb
    .from("copilot_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return (data as CopilotMessageRow[]) ?? [];
}

export async function appendMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  data?: unknown,
): Promise<CopilotMessageRow> {
  const { data: row, error } = await sb
    .from("copilot_messages")
    .insert({ conversation_id: conversationId, role, content, data: data ?? null })
    .select("*")
    .single();
  if (error) throw error;
  await sb.from("copilot_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  return row as CopilotMessageRow;
}

export async function listScheduledReports(userId: string): Promise<CopilotScheduledReportRow[]> {
  const { data } = await sb
    .from("copilot_scheduled_reports")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data as CopilotScheduledReportRow[]) ?? [];
}

export async function createScheduledReport(input: {
  company_id: string;
  user_id: string;
  question: string;
  frequency: "daily" | "weekly" | "monthly";
  delivery_method: "in_app" | "whatsapp" | "email";
}) {
  const { data, error } = await sb
    .from("copilot_scheduled_reports")
    .insert({ ...input, active: true })
    .select("*")
    .single();
  if (error) throw error;
  return data as CopilotScheduledReportRow;
}

export async function toggleScheduledReport(id: string, active: boolean) {
  await sb.from("copilot_scheduled_reports").update({ active }).eq("id", id);
}

export async function deleteScheduledReport(id: string) {
  await sb.from("copilot_scheduled_reports").delete().eq("id", id);
}

export async function listAnomalies(companyId: string, includeDismissed = false): Promise<CopilotAnomalyRow[]> {
  let q = sb.from("copilot_anomalies").select("*").eq("company_id", companyId);
  if (!includeDismissed) q = q.is("dismissed_at", null);
  const { data } = await q.order("created_at", { ascending: false }).limit(100);
  return (data as CopilotAnomalyRow[]) ?? [];
}

export async function dismissAnomaly(id: string, userId: string) {
  await sb
    .from("copilot_anomalies")
    .update({ dismissed_at: new Date().toISOString(), dismissed_by: userId })
    .eq("id", id);
}
