import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export type WorkCategory = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  is_active: boolean;
};

export type OfficeWorkTask = {
  id: string;
  log_id: string;
  category_id: string;
  project_name: string | null;
  customer_id: string | null;
  description: string;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number;
  status: "completed" | "in_progress" | "blocked";
  blocker_note: string | null;
  sort_order: number;
};

export type OfficeWorkLog = {
  id: string;
  user_id: string;
  company_id: string | null;
  work_date: string;
  day_summary: string | null;
  total_minutes: number;
  created_at: string;
  updated_at: string;
  tasks: OfficeWorkTask[];
  author?: { full_name: string | null; email: string | null } | null;
};

/** yyyy-mm-dd in Asia/Dhaka */
export function todayDhaka(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

/** Asia/Dhaka hour 0-23 */
export function hourDhaka(): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Dhaka",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
}

/** Sun=0..Sat=6 in Asia/Dhaka */
export function weekdayDhaka(dateStr?: string): number {
  const d = dateStr ? new Date(`${dateStr}T12:00:00+06:00`) : new Date();
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    weekday: "short",
  }).format(d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
}

export function isWorkingDay(dateStr?: string): boolean {
  const w = weekdayDhaka(dateStr);
  return w >= 0 && w <= 4; // Sun-Thu
}

/** Sunday-anchored week [start, end] as yyyy-mm-dd covering the given date. */
export function sunThuWeek(dateStr: string): { start: string; end: string; days: string[] } {
  const base = new Date(`${dateStr}T12:00:00+06:00`);
  const wd = weekdayDhaka(dateStr);
  const startMs = base.getTime() - wd * 86400000;
  const days: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(startMs + i * 86400000);
    days.push(fmtDate(d));
  }
  return { start: days[0], end: days[4], days };
}

function fmtDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}-${parts.find((p) => p.type === "day")!.value}`;
}

export function formatHm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export function formatHours(minutes: number): string {
  return `${(minutes / 60).toFixed(minutes % 60 === 0 ? 0 : 1)}h`;
}

export async function fetchWorkCategories(): Promise<WorkCategory[]> {
  const { data, error } = await sb
    .from("work_categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as WorkCategory[];
}

export async function fetchOfficeWorkLogs(params: {
  companyId: string | null;
  userId?: string;
  fromDate?: string;
  toDate?: string;
  scope: "self" | "all";
}): Promise<OfficeWorkLog[]> {
  let q = sb
    .from("office_work_logs")
    .select("*, tasks:office_work_tasks(*)")
    .order("work_date", { ascending: false });
  if (params.companyId) q = q.eq("company_id", params.companyId);
  if (params.scope === "self" && params.userId) q = q.eq("user_id", params.userId);
  if (params.userId && params.scope === "all") q = q.eq("user_id", params.userId);
  if (params.fromDate) q = q.gte("work_date", params.fromDate);
  if (params.toDate) q = q.lte("work_date", params.toDate);
  const { data, error } = await q;
  if (error) throw error;
  const logs = (data ?? []) as OfficeWorkLog[];
  logs.forEach((l) => {
    l.tasks = (l.tasks ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  });
  return logs;
}

export async function fetchLogForDate(userId: string, workDate: string): Promise<OfficeWorkLog | null> {
  const { data, error } = await sb
    .from("office_work_logs")
    .select("*, tasks:office_work_tasks(*)")
    .eq("user_id", userId)
    .eq("work_date", workDate)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const log = data as OfficeWorkLog;
  log.tasks = (log.tasks ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  return log;
}

export type TaskDraft = {
  id?: string;
  category_id: string;
  project_name: string | null;
  customer_id: string | null;
  description: string;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number;
  status: "completed" | "in_progress" | "blocked";
  blocker_note: string | null;
  sort_order: number;
};

export async function upsertDayLog(params: {
  userId: string;
  companyId: string | null;
  workDate: string;
  daySummary: string | null;
  tasks: TaskDraft[];
}): Promise<string> {
  // Upsert the log row
  const { data: existing } = await sb
    .from("office_work_logs")
    .select("id")
    .eq("user_id", params.userId)
    .eq("work_date", params.workDate)
    .maybeSingle();

  let logId: string;
  if (existing?.id) {
    logId = existing.id;
    const { error } = await sb
      .from("office_work_logs")
      .update({ day_summary: params.daySummary, company_id: params.companyId })
      .eq("id", logId);
    if (error) throw error;
  } else {
    const { data, error } = await sb
      .from("office_work_logs")
      .insert({
        user_id: params.userId,
        company_id: params.companyId,
        work_date: params.workDate,
        day_summary: params.daySummary,
      })
      .select("id")
      .single();
    if (error) throw error;
    logId = data.id;
  }

  // Replace tasks (simplest correct behavior for edits)
  const { error: delErr } = await sb.from("office_work_tasks").delete().eq("log_id", logId);
  if (delErr) throw delErr;

  const rows = params.tasks.map((t, i) => ({
    log_id: logId,
    category_id: t.category_id,
    project_name: t.project_name,
    customer_id: t.customer_id,
    description: t.description,
    start_time: t.start_time,
    end_time: t.end_time,
    duration_minutes: t.duration_minutes,
    status: t.status,
    blocker_note: t.blocker_note,
    sort_order: i,
  }));
  if (rows.length) {
    const { error: insErr } = await sb.from("office_work_tasks").insert(rows);
    if (insErr) throw insErr;
  }
  return logId;
}

export async function deleteDayLog(id: string) {
  const { error } = await sb.from("office_work_logs").delete().eq("id", id);
  if (error) throw error;
}
