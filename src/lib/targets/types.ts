export type TargetScope = "user" | "territory" | "company";
export type TargetMetric = "revenue" | "visits" | "new_leads" | "won_leads" | "quotes_sent" | "meetings";
export type TargetPeriodKind = "monthly" | "quarterly" | "yearly" | "custom";

export type Target = {
  id: string;
  company_id: string;
  scope: TargetScope;
  user_id: string | null;
  territory_id: string | null;
  metric: TargetMetric;
  period_kind: TargetPeriodKind;
  period_start: string; // YYYY-MM-DD
  period_end: string;
  target_value: number;
  currency: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const METRIC_LABEL: Record<TargetMetric, string> = {
  revenue: "Revenue (won)",
  visits: "Customer visits",
  new_leads: "New leads",
  won_leads: "Deals closed",
  quotes_sent: "Quotes sent",
  meetings: "Meetings logged",
};

export const METRIC_UNIT: Record<TargetMetric, "money" | "count"> = {
  revenue: "money",
  visits: "count",
  new_leads: "count",
  won_leads: "count",
  quotes_sent: "count",
  meetings: "count",
};

export const SCOPE_LABEL: Record<TargetScope, string> = {
  user: "Rep",
  territory: "Territory",
  company: "Company-wide",
};

export const PERIOD_LABEL: Record<TargetPeriodKind, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  custom: "Custom",
};

export function formatTargetValue(metric: TargetMetric, value: number, currency = "USD") {
  if (METRIC_UNIT[metric] === "money") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  }
  return value.toLocaleString();
}

export function periodRangeFor(kind: TargetPeriodKind, anchor: Date): { start: string; end: string } {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  let start: Date, end: Date;
  if (kind === "monthly") {
    start = new Date(y, m, 1);
    end = new Date(y, m + 1, 0);
  } else if (kind === "quarterly") {
    const qStart = Math.floor(m / 3) * 3;
    start = new Date(y, qStart, 1);
    end = new Date(y, qStart + 3, 0);
  } else if (kind === "yearly") {
    start = new Date(y, 0, 1);
    end = new Date(y, 11, 31);
  } else {
    start = new Date(y, m, 1);
    end = new Date(y, m + 1, 0);
  }
  const toIso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: toIso(start), end: toIso(end) };
}
