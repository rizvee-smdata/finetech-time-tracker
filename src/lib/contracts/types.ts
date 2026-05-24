export type ContractType = "one_time" | "amc" | "retainer";
export type ContractStatus = "active" | "expired" | "cancelled" | "draft";
export type PaymentStatus = "pending" | "invoiced" | "received" | "cancelled";

export type Contract = {
  id: string;
  company_id: string;
  lead_id: string | null;
  account_id: string | null;
  user_id: string;
  contract_number: string;
  title: string | null;
  contract_type: ContractType;
  status: ContractStatus;
  start_date: string;
  end_date: string | null;
  total_value: number;
  currency: string;
  payment_terms: string | null;
  file_path: string | null;
  file_name: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type Milestone = {
  id: string;
  contract_id: string;
  sort_order: number;
  name: string;
  due_date: string;
  amount: number;
  status: PaymentStatus;
  invoice_number: string | null;
  received_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
  one_time: "One-Time",
  amc: "AMC",
  retainer: "Retainer",
};

export const CONTRACT_STATUS_META: Record<ContractStatus, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "bg-muted text-muted-foreground" },
  active: { label: "Active", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  expired: { label: "Expired", tone: "bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelled", tone: "bg-destructive/10 text-destructive" },
};

export const PAYMENT_STATUS_META: Record<PaymentStatus, { label: string; tone: string }> = {
  pending: { label: "Pending", tone: "bg-muted text-muted-foreground" },
  invoiced: { label: "Invoiced", tone: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  received: { label: "Received", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  cancelled: { label: "Cancelled", tone: "bg-destructive/10 text-destructive" },
};

export function formatUSD(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);
}

export function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
