import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export type ApprovalRule = {
  id?: string;
  company_id: string;
  enabled: boolean;
  discount_threshold_pct: number;
  amount_threshold: number | null;
  approver_ids: string[];
};

export const DEFAULT_RULE = (companyId: string): ApprovalRule => ({
  company_id: companyId,
  enabled: true,
  discount_threshold_pct: 15,
  amount_threshold: null,
  approver_ids: [],
});

export async function fetchApprovalRule(companyId: string): Promise<ApprovalRule> {
  const { data, error } = await sb
    .from("crm_approval_rules")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_RULE(companyId);
  return {
    id: data.id,
    company_id: data.company_id,
    enabled: !!data.enabled,
    discount_threshold_pct: Number(data.discount_threshold_pct ?? 15),
    amount_threshold: data.amount_threshold == null ? null : Number(data.amount_threshold),
    approver_ids: (data.approver_ids ?? []) as string[],
  };
}

export async function saveApprovalRule(rule: ApprovalRule) {
  const payload = {
    company_id: rule.company_id,
    enabled: rule.enabled,
    discount_threshold_pct: rule.discount_threshold_pct,
    amount_threshold: rule.amount_threshold,
    approver_ids: rule.approver_ids,
  };
  const { error } = await sb.from("crm_approval_rules").upsert(payload, { onConflict: "company_id" });
  if (error) throw error;
}

/** Does this quote need manager approval under the company rule? */
export function quoteNeedsApproval(
  rule: ApprovalRule | undefined | null,
  discountPct: number,
  amount: number,
): { needed: boolean; reasons: string[] } {
  const r = rule ?? null;
  if (!r || !r.enabled) return { needed: false, reasons: [] };
  const reasons: string[] = [];
  if (discountPct >= r.discount_threshold_pct) {
    reasons.push(`Discount ${discountPct}% ≥ ${r.discount_threshold_pct}% threshold`);
  }
  if (r.amount_threshold != null && amount >= r.amount_threshold) {
    reasons.push(`Value ${amount.toLocaleString()} ≥ ${r.amount_threshold.toLocaleString()} threshold`);
  }
  return { needed: reasons.length > 0, reasons };
}

export function canApproveQuote(
  rule: ApprovalRule | undefined | null,
  userId: string | undefined,
  isAdminLike: boolean,
): boolean {
  if (!userId) return false;
  const list = rule?.approver_ids ?? [];
  if (list.length === 0) return isAdminLike;
  return list.includes(userId) || isAdminLike;
}

export type ApprovalLog = {
  id: string;
  entity_id: string;
  action: string;
  actor_id: string | null;
  comments: string | null;
  metadata: any;
  created_at: string;
};

export async function logApproval(p: {
  companyId: string;
  entityId: string;
  action: "requested" | "approved" | "rejected";
  actorId?: string | null;
  comments?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await sb.from("approval_logs").insert({
    company_id: p.companyId,
    entity_type: "crm_quote",
    entity_id: p.entityId,
    action: p.action,
    actor_id: p.actorId ?? null,
    comments: p.comments ?? null,
    metadata: p.metadata ?? {},
  });
}

export async function fetchApprovalLogs(entityIds: string[]): Promise<Record<string, ApprovalLog[]>> {
  if (entityIds.length === 0) return {};
  const { data } = await sb
    .from("approval_logs")
    .select("*")
    .eq("entity_type", "crm_quote")
    .in("entity_id", entityIds)
    .order("created_at", { ascending: false });
  const map: Record<string, ApprovalLog[]> = {};
  for (const row of (data ?? []) as ApprovalLog[]) {
    (map[row.entity_id] ??= []).push(row);
  }
  return map;
}
