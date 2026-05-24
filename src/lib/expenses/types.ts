export type ExpenseStatus = "draft" | "submitted" | "approved" | "rejected";

export interface Expense {
  id: string;
  company_id: string;
  user_id: string;
  category_id: string | null;
  category_name: string;
  amount: number;
  currency: string;
  expense_date: string;
  description: string | null;
  visit_id: string | null;
  lead_id: string | null;
  receipt_path: string | null;
  status: ExpenseStatus;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseCategory {
  id: string;
  company_id: string;
  name: string;
  auto_approve_limit: number | null;
  is_active: boolean;
  sort_order: number;
}

export const STATUS_COLORS: Record<ExpenseStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  approved: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  rejected: "bg-red-500/15 text-red-600 dark:text-red-400",
};

export function formatBDT(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(v);
}
