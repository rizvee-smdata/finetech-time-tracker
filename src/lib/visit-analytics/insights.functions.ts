import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const InputSchema = z.object({
  periodDays: z.union([z.literal(30), z.literal(60), z.literal(90)]).default(30),
});

const SYSTEM_PROMPT = `You are a sales-operations analyst writing for the Managing Director of a B2B technology company.
You will receive a JSON snapshot of visit-coverage data: account counts by tier, stale strategic accounts, open negative outcomes, per-rep coverage rates vs team average, and region trends.

Rules:
1. Base every claim ONLY on the supplied data — no speculation, no invented metrics.
2. If a section has no data, say so plainly. Do not pad.
3. Write in plain business English. No data-science jargon. No bullet salad.
4. Use short headed sections in this exact order:
   ## Top coverage gaps
   ## Reps over-concentrated vs spread
   ## Accounts trending toward neglect
   ## Recommended actions
   Each section: 2-4 short sentences or up to 5 bullets. Be specific — name the accounts and reps when the data names them.
5. Recommendations must be actionable and reference real account / rep names from the data.
6. Never expose internal IDs (UUIDs). Use names only.`;

export const generateVisitInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const periodDays = data.periodDays;

    // Verify staff role
    const [{ data: isAdmin }, { data: isManager }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" as const }),
      supabase.rpc("has_role", { _user_id: userId, _role: "manager" as const }),
    ]);
    if (!isAdmin && !isManager) throw new Response("Forbidden", { status: 403 });

    // Get company_id from membership
    const { data: membership } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    const companyId = membership?.company_id;
    if (!companyId) throw new Response("No company membership", { status: 400 });

    // ----- Build dataset -----
    const since = new Date(Date.now() - periodDays * 24 * 3600 * 1000).toISOString();
    const priorStart = new Date(Date.now() - 2 * periodDays * 24 * 3600 * 1000).toISOString();

    const [accountsRes, checkinsRes, meetingsRes, profilesRes] = await Promise.all([
      supabase.from("customers")
        .select("id, customer_name, kind, tier, region, assigned_rep_id")
        .eq("company_id", companyId).is("deleted_at", null),
      supabase.from("visit_checkins")
        .select("account_id, user_id, checkin_time")
        .eq("company_id", companyId).gte("checkin_time", priorStart),
      supabase.from("customer_visits")
        .select("account_id, user_id, meeting_at, ai_sentiment, next_action")
        .eq("company_id", companyId).gte("meeting_at", priorStart),
      supabase.from("profiles").select("id, full_name"),
    ]);

    const accounts = (accountsRes.data ?? []) as any[];
    const checkins = (checkinsRes.data ?? []) as any[];
    const meetings = (meetingsRes.data ?? []) as any[];
    const repName = new Map<string, string>((profilesRes.data ?? []).map((p: any) => [p.id, p.full_name ?? "Unnamed"]));
    const accName = new Map<string, any>(accounts.map((a) => [a.id, a]));

    // last visit per account
    const lastVisit = new Map<string, Date>();
    const visitsCurrent = new Map<string, number>(); // account -> count in current period
    const sinceMs = new Date(since).getTime();
    const consume = (aid: string | null, when: Date) => {
      if (!aid) return;
      const cur = lastVisit.get(aid);
      if (!cur || when > cur) lastVisit.set(aid, when);
      if (when.getTime() >= sinceMs) visitsCurrent.set(aid, (visitsCurrent.get(aid) ?? 0) + 1);
    };
    checkins.forEach((r) => r.checkin_time && consume(r.account_id, new Date(r.checkin_time)));
    const lastMeetByAccount = new Map<string, any>();
    meetings.forEach((r) => {
      if (!r.meeting_at) return;
      const d = new Date(r.meeting_at);
      consume(r.account_id, d);
      if (r.account_id) {
        const cur = lastMeetByAccount.get(r.account_id);
        if (!cur || d > new Date(cur.meeting_at)) lastMeetByAccount.set(r.account_id, r);
      }
    });

    const now = Date.now();
    const daysSince = (d: Date | undefined) => d ? Math.floor((now - d.getTime()) / 86400000) : null;

    // Stale strategic
    const stale = accounts
      .filter((a) => a.tier === "strategic" || a.tier === "standard")
      .map((a) => ({
        name: a.customer_name,
        tier: a.tier,
        kind: a.kind,
        rep: a.assigned_rep_id ? repName.get(a.assigned_rep_id) : "Unassigned",
        days_since_visit: daysSince(lastVisit.get(a.id)),
      }))
      .filter((r) => r.days_since_visit === null || r.days_since_visit >= periodDays)
      .sort((a, b) => (b.days_since_visit ?? 99999) - (a.days_since_visit ?? 99999))
      .slice(0, 20);

    // Open negatives
    const negatives: any[] = [];
    lastMeetByAccount.forEach((m, aid) => {
      if (m.ai_sentiment === "negative" || (m.next_action && String(m.next_action).trim())) {
        const a = accName.get(aid);
        if (!a) return;
        negatives.push({
          name: a.customer_name,
          rep: a.assigned_rep_id ? repName.get(a.assigned_rep_id) : "Unassigned",
          last_meeting: m.meeting_at,
          sentiment: m.ai_sentiment,
          pending_action: m.next_action ?? null,
        });
      }
    });

    // Rep coverage by tier (current period)
    const tierRepCounts = new Map<string, Map<string, { visits: number; assigned: number }>>();
    accounts.forEach((a) => {
      if (!a.tier || !a.assigned_rep_id) return;
      const t = a.tier, r = a.assigned_rep_id;
      if (!tierRepCounts.has(t)) tierRepCounts.set(t, new Map());
      const m = tierRepCounts.get(t)!;
      const e = m.get(r) ?? { visits: 0, assigned: 0 };
      e.assigned += 1;
      e.visits += visitsCurrent.get(a.id) ?? 0;
      m.set(r, e);
    });
    const repCoverage: any[] = [];
    tierRepCounts.forEach((reps, tier) => {
      const rates = [...reps.values()].map((v) => v.visits / Math.max(1, v.assigned));
      const avg = rates.reduce((s, x) => s + x, 0) / Math.max(1, rates.length);
      reps.forEach((v, rid) => {
        const rate = v.visits / Math.max(1, v.assigned);
        repCoverage.push({
          rep: repName.get(rid) ?? "Rep",
          tier,
          assigned: v.assigned,
          visits_per_account: +rate.toFixed(2),
          team_avg: +avg.toFixed(2),
        });
      });
    });

    // Region trend
    const cur = new Map<string, number>();
    const prior = new Map<string, number>();
    const priorMs = new Date(priorStart).getTime();
    const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
    const acctRegion = (aid: string | null) => aid ? (accName.get(aid)?.region ?? "Unassigned") : "Unassigned";
    const tally = (aid: string | null, t: number) => {
      if (!aid) return;
      const region = acctRegion(aid);
      if (t >= sinceMs) inc(cur, region);
      else if (t >= priorMs) inc(prior, region);
    };
    checkins.forEach((r) => r.checkin_time && tally(r.account_id, new Date(r.checkin_time).getTime()));
    meetings.forEach((r) => r.meeting_at && tally(r.account_id, new Date(r.meeting_at).getTime()));
    const regions: any[] = [];
    cur.forEach((c, region) => {
      const p = prior.get(region) ?? 0;
      regions.push({ region, current: c, prior: p, delta_pct: p > 0 ? +(((c - p) / p) * 100).toFixed(0) : null });
    });

    const snapshot = {
      period_days: periodDays,
      generated_at: new Date().toISOString(),
      totals: {
        accounts: accounts.length,
        strategic: accounts.filter((a) => a.tier === "strategic").length,
        standard: accounts.filter((a) => a.tier === "standard").length,
        visits_current_period: [...visitsCurrent.values()].reduce((s, x) => s + x, 0),
      },
      stale_strategic: stale,
      open_negatives: negatives.slice(0, 20),
      rep_coverage: repCoverage,
      region_trends: regions,
    };

    // ----- Call Lovable AI Gateway -----
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Response("LOVABLE_API_KEY missing", { status: 500 });

    const model = "google/gemini-3-pro-preview";
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Visit coverage snapshot (JSON):\n\n${JSON.stringify(snapshot, null, 2)}` },
        ],
      }),
    });

    if (!aiRes.ok) {
      const body = await aiRes.text();
      if (aiRes.status === 429) throw new Response("AI rate limit exceeded — try again shortly.", { status: 429 });
      if (aiRes.status === 402) throw new Response("AI credits exhausted — add credits in workspace billing.", { status: 402 });
      throw new Response(`AI gateway error ${aiRes.status}: ${body.slice(0, 200)}`, { status: 502 });
    }
    const aiJson = await aiRes.json();
    const content: string = aiJson.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) throw new Response("Empty AI response", { status: 502 });

    // Save
    const { data: saved, error: saveErr } = await supabase.from("ai_visit_insights").insert({
      company_id: companyId,
      filter_params: { period_days: periodDays },
      content,
      model,
      created_by: userId,
    }).select("id, generated_at, content, model").single();
    if (saveErr) throw new Response(`Save failed: ${saveErr.message}`, { status: 500 });

    return saved;
  });

export const getLatestVisitInsight = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: membership } = await supabase
      .from("company_members").select("company_id").eq("user_id", userId).limit(1).maybeSingle();
    if (!membership?.company_id) return null;
    const { data } = await supabase
      .from("ai_visit_insights")
      .select("id, generated_at, content, model, filter_params")
      .eq("company_id", membership.company_id)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  });
