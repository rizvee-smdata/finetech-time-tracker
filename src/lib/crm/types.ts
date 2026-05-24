export type CrmStage =
  | "new"
  | "initial_contact"
  | "pricing"
  | "negotiation"
  | "closure"
  | "won"
  | "lost";

export const STAGES: { id: CrmStage; label: string; color: string; badge: string }[] = [
  { id: "new", label: "New", color: "bg-slate-500", badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
  { id: "initial_contact", label: "Initial Contact", color: "bg-blue-500", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200" },
  { id: "pricing", label: "Pricing", color: "bg-cyan-500", badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-200" },
  { id: "negotiation", label: "Negotiation", color: "bg-amber-500", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200" },
  { id: "closure", label: "Closure", color: "bg-purple-500", badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200" },
  { id: "won", label: "Won", color: "bg-green-600", badge: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200" },
  { id: "lost", label: "Lost", color: "bg-red-500", badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200" },
];

export const ACTIVE_STAGES: CrmStage[] = ["new", "initial_contact", "pricing", "negotiation", "closure"];

export function stageMeta(s: CrmStage) {
  return STAGES.find((x) => x.id === s) ?? STAGES[0];
}

export type Lead = {
  id: string;
  company_id: string;
  source: "visit" | "manual";
  source_visit_id: string | null;
  customer_name: string;
  company_name: string | null;
  contact_person: string | null;
  designation: string | null;
  phone: string | null;
  email: string | null;
  location: string | null;
  stage: CrmStage;
  assigned_to: string | null;
  created_by: string;
  expected_value: number | null;
  currency: string;
  probability: number;
  expected_close_date: string | null;
  lost_reason: string | null;
  notes: string | null;
  stage_changed_at: string;
  won_at: string | null;
  lost_at: string | null;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
  assignee?: { id: string; full_name: string | null; email: string | null } | null;
};

export type LeadActivity = {
  id: string;
  lead_id: string;
  user_id: string | null;
  activity_type: string;
  title: string | null;
  body: string | null;
  occurred_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type Quote = {
  id: string;
  lead_id: string;
  company_id: string;
  version: number;
  title: string;
  amount: number;
  currency: string;
  status: "draft" | "sent" | "accepted" | "rejected";
  valid_until: string | null;
  sent_at: string | null;
  decided_at: string | null;
  notes: string | null;
  file_path: string | null;
  file_name: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export function formatMoney(value: number | null | undefined, currency = "USD") {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}
