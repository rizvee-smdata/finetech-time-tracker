import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PartnerAccountDigest = {
  account_id: string;
  account_name: string;
  partner_name: string | null;
  visits_30d: number;
  last_visit_at: string | null;
  last_visit_summary: string | null;
  next_action: string | null;
  open_pipeline: number;
  open_deals: number;
};

export type PartnerPortalData = {
  partners: { id: string; name: string; account_count: number }[];
  digests: PartnerAccountDigest[];
};

/** Partner Portal Lite — read-only digest of activity per partner-managed account. */
export const getPartnerPortalDigest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { partner_id?: string; days?: number } | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<PartnerPortalData> => {
    const { supabase } = context;
    const days = data.days ?? 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const [{ data: accounts }, { data: visits }, { data: leads }, { data: partnersList }] =
      await Promise.all([
        supabase.from("crm_accounts").select("id, name"),
        supabase
          .from("customer_visits")
          .select("id, account_id, meeting_at, discussion_summary, next_action")
          .gte("meeting_at", since)
          .order("meeting_at", { ascending: false }),
        supabase
          .from("crm_leads")
          .select("account_id, partner_id, expected_value, stage"),
        supabase.from("customers").select("id, customer_name, kind").eq("kind", "partner"),
      ]);

    const partnerMap = new Map(
      (partnersList ?? []).map((p) => [p.id, p.customer_name ?? "Partner"]),
    );

    // Derive partner_id per account from leads (most recent association wins).
    const accountPartner = new Map<string, string>();
    (leads ?? []).forEach((l) => {
      if (l.account_id && l.partner_id && !accountPartner.has(l.account_id)) {
        accountPartner.set(l.account_id, l.partner_id);
      }
    });

    const filtered = (accounts ?? []).filter((a) => {
      const pid = accountPartner.get(a.id);
      if (!pid) return false;
      return data.partner_id ? pid === data.partner_id : true;
    });

    const visitsByAcc = new Map<string, NonNullable<typeof visits>>();
    (visits ?? []).forEach((v) => {
      if (!v.account_id) return;
      const arr = visitsByAcc.get(v.account_id) ?? [];
      arr.push(v);
      visitsByAcc.set(v.account_id, arr);
    });

    const pipelineByAcc = new Map<string, { value: number; count: number }>();
    (leads ?? []).forEach((l) => {
      if (!l.account_id || l.stage === "won" || l.stage === "lost") return;
      const cur = pipelineByAcc.get(l.account_id) ?? { value: 0, count: 0 };
      cur.value += Number(l.expected_value ?? 0);
      cur.count += 1;
      pipelineByAcc.set(l.account_id, cur);
    });

    const digests: PartnerAccountDigest[] = filtered.map((a) => {
      const vs = visitsByAcc.get(a.id) ?? [];
      const last = vs[0];
      const pipe = pipelineByAcc.get(a.id) ?? { value: 0, count: 0 };
      const pid = accountPartner.get(a.id);
      return {
        account_id: a.id,
        account_name: a.name ?? "Account",
        partner_name: pid ? (partnerMap.get(pid) ?? null) : null,
        visits_30d: vs.length,
        last_visit_at: last?.meeting_at ?? null,
        last_visit_summary: last?.discussion_summary ?? null,
        next_action: last?.next_action ?? null,
        open_pipeline: pipe.value,
        open_deals: pipe.count,
      };
    });

    const partnerCounts = new Map<string, number>();
    filtered.forEach((a) => {
      const pid = accountPartner.get(a.id);
      if (pid) partnerCounts.set(pid, (partnerCounts.get(pid) ?? 0) + 1);
    });
    const partners = Array.from(partnerCounts.entries()).map(([id, account_count]) => ({
      id,
      name: partnerMap.get(id) ?? "Partner",
      account_count,
    }));
    partners.sort((a, b) => b.account_count - a.account_count);

    digests.sort((a, b) => (b.last_visit_at ?? "").localeCompare(a.last_visit_at ?? ""));
    return { partners, digests };
  });
