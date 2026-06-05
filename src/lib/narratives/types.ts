export type NarrativeRole = "ceo" | "sales" | "ops" | "custom";
export type NarrativeLanguage = "en" | "bn";
export type NarrativeChannel = "in_app" | "whatsapp" | "email";

export interface NarrativeMetrics {
  revenue_closed: number;
  revenue_prev_period: number;
  revenue_target: number;
  new_deals_count: number;
  new_deals_value: number;
  pipeline_value: number;
  pipeline_by_stage: Array<{ stage: string; count: number; value: number }>;
  visits_done: number;
  visits_target: number;
  attendance_rate: number;
  top_rep: { name: string; revenue: number } | null;
  at_risk_clients: number;
  nps_avg: number | null;
  expenses_total: number;
  expenses_budget: number;
  rep_breakdown?: Array<{ name: string; revenue: number; visits: number; deals: number }>;
  revenue_trend?: Array<{ week: string; revenue: number }>;
}

export interface NarrativeReportRow {
  id: string;
  company_id: string;
  role: NarrativeRole;
  week_start: string;
  week_end: string;
  language: NarrativeLanguage;
  title: string;
  summary: string | null;
  body_md: string;
  metrics: NarrativeMetrics;
  pdf_url: string | null;
  delivered_channels: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface NarrativeSettingsRow {
  id: string;
  company_id: string;
  role: NarrativeRole;
  enabled: boolean;
  role_description: string;
  channels: NarrativeChannel[];
  delivery_time: string;
  language: NarrativeLanguage;
  custom_kpis: string[];
  whatsapp_recipients: string[];
  email_recipients: string[];
  created_at: string;
  updated_at: string;
}

export const ROLE_LABEL: Record<NarrativeRole, string> = {
  ceo: "CEO View",
  sales: "Sales Head View",
  ops: "Operations View",
  custom: "Custom View",
};

export const DEFAULT_ROLE_PROMPTS: Record<NarrativeRole, string> = {
  ceo: "You are a business intelligence AI writing a weekly performance summary for the CEO of a technology distribution company in Bangladesh. Write in a confident, executive tone. Lead with the most important business signal. Highlight revenue performance, pipeline health, and key risks. Be specific with numbers. 200-250 words. Use BDT with lakh/crore notation. Structure: Opening (overall health sentence), Revenue Performance (2-3 sentences with data), Pipeline & Growth (2-3 sentences), People & Operations (1-2 sentences), Key Actions Required (2-3 bullet points).",
  sales: "You are a business intelligence AI writing a weekly summary for the Sales Head of a technology distribution company in Bangladesh. Be granular on rep performance, client risk, deal velocity, and territory coverage. 220-260 words. Use BDT with lakh/crore notation. Structure: Opening (sales health), Rep Performance (name top + bottom rep), Pipeline Velocity (stalled deals, stage flow), Client Risk (at-risk accounts), Recommended Actions (3 bullets).",
  ops: "You are a business intelligence AI writing a weekly summary for the Operations head of a technology distribution company in Bangladesh. Focus on visits coverage, attendance, expenses, and approvals. 180-220 words. Use BDT with lakh/crore notation. Structure: Opening (operations health), Field Coverage (visits vs target, attendance), Cost Discipline (expenses vs budget, outliers), Bottlenecks (approvals, stuck items), Recommended Actions (3 bullets).",
  custom: "You are a business intelligence AI writing a weekly summary tailored to the role and KPIs described by the company. Use a confident, professional tone. 200-250 words. Use BDT with lakh/crore notation.",
};
