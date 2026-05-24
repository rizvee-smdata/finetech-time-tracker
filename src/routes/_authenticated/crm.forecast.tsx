import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchCompanyMembers } from "@/lib/crm/queries";
import { formatMoney } from "@/lib/crm/types";
import { format, startOfMonth, endOfMonth, addMonths, startOfQuarter, endOfQuarter } from "date-fns";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/crm/forecast")({
  component: ForecastPage,
});

type Bucket = "commit" | "best" | "pipeline";

function bucketize(stage: string, prob: number): Bucket {
  if (stage === "negotiation" || prob >= 80) return "commit";
  if (stage === "proposal" || prob >= 50) return "best";
  return "pipeline";
}

function ForecastPage() {
  const { companyId } = useAuth();
  const now = new Date();
  const [period, setPeriod] = useState<"month" | "quarter">("month");

  const range = useMemo(() => {
    return period === "month"
      ? { start: startOfMonth(now), end: endOfMonth(now), label: format(now, "MMMM yyyy") }
      : { start: startOfQuarter(now), end: endOfQuarter(now), label: `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}` };
  }, [period, now]);

  const leads = useQuery({
    queryKey: ["crm-forecast-leads", companyId, period],
    queryFn: async () => {
      const { data } = await sb.from("crm_leads")
        .select("id, stage, probability, expected_value, expected_close_date, assigned_to, won_at, currency")
        .eq("company_id", companyId);
      return (data ?? []) as any[];
    },
    enabled: !!companyId,
  });

  const members = useQuery({
    queryKey: ["crm-members", companyId],
    queryFn: () => fetchCompanyMembers(companyId!),
    enabled: !!companyId,
  });

  const monthKey = format(startOfMonth(now), "yyyy-MM-dd");
  const targets = useQuery({
    queryKey: ["crm-targets", companyId, monthKey],
    queryFn: async () => {
      const { data } = await sb.from("crm_targets").select("*")
        .eq("company_id", companyId).eq("period_month", monthKey);
      return (data ?? []) as any[];
    },
    enabled: !!companyId,
  });

  const summary = useMemo(() => {
    const inRange = (d?: string | null) => {
      if (!d) return false;
      const dt = new Date(d);
      return dt >= range.start && dt <= range.end;
    };
    let commit = 0, best = 0, pipeline = 0, weighted = 0, won = 0;
    const perRep = new Map<string, { commit: number; best: number; pipeline: number; weighted: number; won: number }>();
    for (const l of leads.data ?? []) {
      const key = l.assigned_to ?? "__unassigned__";
      const rep = perRep.get(key) ?? { commit: 0, best: 0, pipeline: 0, weighted: 0, won: 0 };
      const value = Number(l.expected_value || 0);
      const prob = Number(l.probability || 0);

      if (l.stage === "won" && inRange(l.won_at ?? l.expected_close_date)) {
        won += value;
        rep.won += value;
      } else if (l.stage !== "won" && l.stage !== "lost" && inRange(l.expected_close_date)) {
        const b = bucketize(l.stage, prob);
        const w = value * (prob / 100);
        weighted += w;
        rep.weighted += w;
        if (b === "commit") { commit += value; rep.commit += value; }
        else if (b === "best") { best += value; rep.best += value; }
        else { pipeline += value; rep.pipeline += value; }
      }
      perRep.set(key, rep);
    }
    return { commit, best, pipeline, weighted, won, perRep };
  }, [leads.data, range]);

  if (!companyId) return <p className="text-sm text-muted-foreground">Select a company first.</p>;

  const targetByUser = new Map<string, number>((targets.data ?? []).map((t: any) => [t.user_id, Number(t.target_value)]));
  const memberById = new Map((members.data ?? []).map((m) => [m.id, m]));

  const repRows = Array.from(summary.perRep.entries())
    .map(([uid, s]) => ({
      uid,
      name: uid === "__unassigned__" ? "Unassigned" : (memberById.get(uid)?.full_name ?? memberById.get(uid)?.email ?? "Unknown"),
      ...s,
      target: targetByUser.get(uid) ?? 0,
      attainment: (targetByUser.get(uid) ?? 0) > 0 ? Math.round((s.won / (targetByUser.get(uid) ?? 1)) * 100) : 0,
    }))
    .sort((a, b) => (b.won + b.weighted) - (a.won + a.weighted));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Forecast — {range.label}</h2>
          <p className="text-sm text-muted-foreground">Weighted pipeline by close date, plus per-rep attainment.</p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as any)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="month">This month</SelectItem>
            <SelectItem value="quarter">This quarter</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Won (closed)" value={summary.won} accent="text-emerald-600" />
        <StatCard label="Commit" value={summary.commit} hint="Negotiation or 80%+" />
        <StatCard label="Best case" value={summary.best} hint="Proposal or 50%+" />
        <StatCard label="Pipeline" value={summary.pipeline} hint="Earlier stages" />
        <StatCard label="Weighted forecast" value={summary.weighted} accent="text-primary" hint="Σ value × probability" />
      </div>

      <Card className="p-4">
        <div className="font-medium mb-3">Rep attainment ({format(startOfMonth(now), "MMMM yyyy")} target)</div>
        {repRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No leads in this period yet.</p>
        ) : (
          <div className="space-y-3">
            {repRows.map((r) => {
              const pct = Math.min(r.attainment, 200);
              return (
                <div key={r.uid} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium truncate">{r.name}</span>
                    <div className="flex items-center gap-2 shrink-0 text-xs">
                      <span className="text-emerald-600">{formatMoney(r.won)}</span>
                      <span className="text-muted-foreground">/ {r.target ? formatMoney(r.target) : "no target"}</span>
                      {r.target > 0 && (
                        <Badge variant={r.attainment >= 100 ? "default" : "outline"}>{r.attainment}%</Badge>
                      )}
                    </div>
                  </div>
                  <Progress value={Math.min(pct, 100)} className="h-2" />
                  <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                    <span>Commit {formatMoney(r.commit)}</span>·
                    <span>Best {formatMoney(r.best)}</span>·
                    <span>Pipeline {formatMoney(r.pipeline)}</span>·
                    <span>Weighted {formatMoney(r.weighted)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({ label, value, hint, accent }: { label: string; value: number; hint?: string; accent?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${accent ?? ""}`}>{formatMoney(value)}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-1">{hint}</div>}
    </Card>
  );
}
