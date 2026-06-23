import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RepLoad = {
  user_id: string;
  rep_name: string;
  accounts: number;
  open_pipeline: number;
  visits_30d: number;
  stale_accounts: number;
  load_score: number; // composite workload
};

export type RebalanceSuggestion = {
  from_user_id: string;
  from_name: string;
  to_user_id: string;
  to_name: string;
  account_id: string;
  account_name: string;
  reason: string;
};

export type TerritorySimulation = {
  reps: RepLoad[];
  suggestions: RebalanceSuggestion[];
  imbalance_pct: number; // (max-min)/avg
};

export type LeaderboardRow = {
  user_id: string;
  rep_name: string;
  visits: number;
  unique_accounts: number;
  quality_visits: number;
  pipeline_generated: number;
  deals_won: number;
  revenue_won: number;
  score: number;
  rank: number;
};

/** Territory rebalance simulator — surfaces workload imbalance and reassignment suggestions. */
export const getTerritorySimulation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number } | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<TerritorySimulation> => {
    const { supabase } = context;
    const days = data.days ?? 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const staleCutoff = new Date(Date.now() - 21 * 86400000).toISOString();

    const [{ data: accounts }, { data: leads }, { data: visits }, { data: profiles }] =
      await Promise.all([
        supabase.from("crm_accounts").select("id, name, primary_owner"),
        supabase.from("crm_leads").select("id, account_id, assigned_to, expected_value, stage, last_activity_at"),
        supabase.from("customer_visits").select("user_id, meeting_at").gte("meeting_at", since),
        supabase.from("profiles").select("id, full_name, email"),
      ]);

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || "Unknown"]));
    const reps = new Map<string, RepLoad>();
    const ensure = (uid: string): RepLoad => {
      let r = reps.get(uid);
      if (!r) {
        r = {
          user_id: uid,
          rep_name: profileMap.get(uid) ?? "Unknown",
          accounts: 0, open_pipeline: 0, visits_30d: 0, stale_accounts: 0, load_score: 0,
        };
        reps.set(uid, r);
      }
      return r;
    };

    const accountOwner = new Map<string, string>();
    (accounts ?? []).forEach((a) => {
      if (a.primary_owner) {
        ensure(a.primary_owner).accounts += 1;
        accountOwner.set(a.id, a.primary_owner);
      }
    });

    (leads ?? []).forEach((l) => {
      if (!l.assigned_to) return;
      const r = ensure(l.assigned_to);
      if (l.stage !== "won" && l.stage !== "lost") {
        r.open_pipeline += Number(l.expected_value ?? 0);
      }
      if (l.account_id && (!l.last_activity_at || l.last_activity_at < staleCutoff)) {
        r.stale_accounts += 1;
      }
    });

    (visits ?? []).forEach((v) => {
      if (v.user_id) ensure(v.user_id).visits_30d += 1;
    });

    const repList = Array.from(reps.values()).map((r) => ({
      ...r,
      load_score: r.accounts * 2 + r.open_pipeline / 100000 + r.stale_accounts * 1.5,
    }));
    repList.sort((a, b) => b.load_score - a.load_score);

    const avg = repList.reduce((s, r) => s + r.load_score, 0) / Math.max(1, repList.length);
    const max = repList[0]?.load_score ?? 0;
    const min = repList[repList.length - 1]?.load_score ?? 0;
    const imbalance_pct = avg > 0 ? ((max - min) / avg) * 100 : 0;

    // Suggestions: move 1-2 stale accounts from most loaded reps to least loaded reps
    const suggestions: RebalanceSuggestion[] = [];
    if (repList.length >= 2 && imbalance_pct > 40) {
      const overloaded = repList.slice(0, Math.ceil(repList.length / 3));
      const underloaded = repList.slice(-Math.ceil(repList.length / 3));
      for (const from of overloaded) {
        // find stale accounts owned by this rep
        const candidates = (accounts ?? []).filter(
          (a) => a.primary_owner === from.user_id,
        );
        const staleSet = new Set(
          (leads ?? [])
            .filter((l) => l.assigned_to === from.user_id && (!l.last_activity_at || l.last_activity_at < staleCutoff))
            .map((l) => l.account_id)
            .filter(Boolean) as string[],
        );
        const staleAccs = candidates.filter((a) => staleSet.has(a.id)).slice(0, 2);
        for (const acc of staleAccs) {
          const to = underloaded[suggestions.length % underloaded.length];
          if (!to || to.user_id === from.user_id) continue;
          suggestions.push({
            from_user_id: from.user_id, from_name: from.rep_name,
            to_user_id: to.user_id, to_name: to.rep_name,
            account_id: acc.id, account_name: acc.name ?? "Account",
            reason: "Stale account on overloaded rep — reassign to balance workload",
          });
          if (suggestions.length >= 10) break;
        }
        if (suggestions.length >= 10) break;
      }
    }

    return { reps: repList, suggestions, imbalance_pct };
  });

/** Field rep leaderboard — composite scoring across activity, quality, and revenue. */
export const getRepLeaderboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number } | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<{ rows: LeaderboardRow[] }> => {
    const { supabase } = context;
    const days = data.days ?? 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const [{ data: visits }, { data: flags }, { data: leads }, { data: profiles }] =
      await Promise.all([
        supabase.from("customer_visits").select("id, user_id, customer_name, meeting_at").gte("meeting_at", since),
        supabase.from("visit_quality_flags").select("visit_id, user_id").gte("detected_at", since),
        supabase.from("crm_leads").select("assigned_to, expected_value, stage, won_at, created_at"),
        supabase.from("profiles").select("id, full_name, email"),
      ]);

    const flagSet = new Set((flags ?? []).map((f) => f.visit_id));
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || "Unknown"]));
    const agg = new Map<string, LeaderboardRow>();
    const ensure = (uid: string): LeaderboardRow => {
      let r = agg.get(uid);
      if (!r) {
        r = {
          user_id: uid, rep_name: profileMap.get(uid) ?? "Unknown",
          visits: 0, unique_accounts: 0, quality_visits: 0,
          pipeline_generated: 0, deals_won: 0, revenue_won: 0,
          score: 0, rank: 0,
        };
        agg.set(uid, r);
      }
      return r;
    };

    const accountsByRep = new Map<string, Set<string>>();
    (visits ?? []).forEach((v) => {
      if (!v.user_id) return;
      const r = ensure(v.user_id);
      r.visits += 1;
      if (!flagSet.has(v.id)) r.quality_visits += 1;
      if (v.customer_name) {
        let s = accountsByRep.get(v.user_id);
        if (!s) { s = new Set(); accountsByRep.set(v.user_id, s); }
        s.add(v.customer_name);
      }
    });
    accountsByRep.forEach((s, uid) => { ensure(uid).unique_accounts = s.size; });

    (leads ?? []).forEach((l) => {
      if (!l.assigned_to) return;
      const r = ensure(l.assigned_to);
      if (l.created_at && l.created_at >= since) {
        r.pipeline_generated += Number(l.expected_value ?? 0);
      }
      if (l.stage === "won" && l.won_at && l.won_at >= since) {
        r.deals_won += 1;
        r.revenue_won += Number(l.expected_value ?? 0);
      }
    });

    const rows = Array.from(agg.values()).map((r) => ({
      ...r,
      score: Math.round(
        r.quality_visits * 3 +
        r.unique_accounts * 2 +
        r.deals_won * 10 +
        r.revenue_won / 10000 +
        r.pipeline_generated / 50000,
      ),
    }));
    rows.sort((a, b) => b.score - a.score);
    rows.forEach((r, i) => { r.rank = i + 1; });

    return { rows };
  });
