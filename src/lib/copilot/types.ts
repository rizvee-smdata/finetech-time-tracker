export type CopilotRole = "user" | "assistant" | "system";

export interface CopilotChartSeries {
  key: string;
  label: string;
  color?: string;
}

export interface CopilotChart {
  type: "bar" | "line" | "pie";
  data: Array<Record<string, string | number>>;
  x_key: string;
  series: CopilotChartSeries[];
  title?: string;
}

export interface CopilotTable {
  columns: Array<{ key: string; label: string; format?: "bdt" | "number" | "percent" | "text" | "date" }>;
  rows: Array<Record<string, string | number | null>>;
  title?: string;
}

export interface CopilotDrillDown {
  label: string;
  path: string;
}

export interface CopilotAnswer {
  answer: string;
  table?: CopilotTable | null;
  chart?: CopilotChart | null;
  drill_downs?: CopilotDrillDown[] | null;
  citation: string;
}

export interface CopilotMessageRow {
  id: string;
  conversation_id: string;
  role: CopilotRole;
  content: string;
  data: CopilotAnswer | null;
  created_at: string;
}

export interface CopilotConversationRow {
  id: string;
  company_id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface CopilotScheduledReportRow {
  id: string;
  company_id: string;
  user_id: string;
  question: string;
  frequency: "daily" | "weekly" | "monthly";
  delivery_method: "in_app" | "whatsapp" | "email";
  active: boolean;
  last_run_at: string | null;
  last_result: CopilotAnswer | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CopilotAnomalyRow {
  id: string;
  company_id: string;
  kind: string;
  severity: "low" | "medium" | "high";
  title: string;
  description: string;
  suggested_action: string | null;
  target_user_id: string | null;
  target_lead_id: string | null;
  metadata: Record<string, unknown> | null;
  dismissed_at: string | null;
  dismissed_by: string | null;
  detected_for_date: string;
  created_at: string;
}

export const STARTER_QUESTIONS = [
  "Which clients are most at risk of churning?",
  "What is our pipeline coverage for next quarter?",
  "Which product line is performing best this month?",
  "Show me reps with declining performance this quarter",
  "What is the average deal cycle time by product?",
  "Which areas are under-visited this month?",
  "Why is the team missing target this month?",
] as const;
