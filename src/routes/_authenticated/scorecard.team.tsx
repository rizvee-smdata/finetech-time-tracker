import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { KPI_DEFS, type KpiKey, isoDate, monthRange, overallScore, pctOf, ragClasses, ragOf } from "@/lib/scorecard/scoring";
import { formatBDT } from "@/lib/manager/helpers";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/scorecard/team")({
  component: TeamScorecard,
});

type Row = {
  user_id: string;
  full_name: string;
  email: string;
  revenue_actual: number; revenue_target: number;
  deals_actual: number; deals_target: number;
  visits_actual: number; visits_target: number;
  calls_actual: number; calls_target: number;
  demos_actual: number; demos_target: number;
  proposals_actual: number; proposals_target: number;
  overall: number;
};

type SortKey = "name" | "overall" | KpiKey;

function TeamScorecard() {
  const { companyId, isStaff } = useAuth();
  const period = useMemo(() => monthRange(), []);
  const [sortKey, setSortKey] = useState<SortKey>("overall");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const teamQ = useQuery({
    queryKey: ["team-scorecard", companyId, period.label],
    enabled: !!companyId && isStaff,
    queryFn: async () => {
      const { data: members } = await supabase
        .from("company_members")
        .select("user_id")
        .eq("company_id", companyId!);
      const ids = (members ?? []).map((m: any) => m.user_id);
      if (!ids.length) return [] as Row[];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .in("id", ids);
      const pmap = new Map<string, any>((profiles ?? []).map((p: any) => [p.id, p]));

      const { data: targets } = await supabase
        .from("targets")
        .select("user_id,metric,target_value")
        .eq("company_id", companyId!)
        .in("user_id", ids)
        .lte("period_start", isoDate(period.end))
        .gte("period_end", isoDate(period.start));
      const tmap = new Map<string, Record<string, number>>();
      for (const t of targets ?? []) {
        const m = tmap.get((t as any).user_id) ?? {};
        m[(t as any).metric] = Number((t as any).target_value ?? 0);
        tmap.set((t as any).user_id, m);
      }

      const rows = await Promise.all(ids.map(async (uid: string) => {
        const { data } = await supabase.rpc("compute_performance_kpis", {
          _user: uid, _company: companyId!, _start: isoDate(period.start), _end: isoDate(period.end),
        });
        const a = (Array.isArray(data) ? data[0] : data) as any || {};
        const t = tmap.get(uid) ?? {};
        const row: Row = {
          user_id: uid,
          full_name: pmap.get(uid)?.full_name ?? pmap.get(uid)?.email ?? "—",
          email: pmap.get(uid)?.email ?? "",
          revenue_actual: Number(a.revenue_actual ?? 0), revenue_target: t.revenue ?? 0,
          deals_actual: Number(a.deals_actual ?? 0), deals_target: t.won_leads ?? 0,
          visits_actual: Number(a.visits_actual ?? 0), visits_target: t.visits ?? 0,
          calls_actual: Number(a.calls_actual ?? 0), calls_target: t.calls ?? 0,
          demos_actual: Number(a.demos_actual ?? 0), demos_target: t.demos ?? 0,
          proposals_actual: Number(a.proposals_actual ?? 0), proposals_target: t.proposals ?? 0,
          overall: 0,
        };
        row.overall = overallScore(row as any);
        return row;
      }));
      return rows;
    },
  });

  const sorted = useMemo(() => {
    const arr = [...(teamQ.data ?? [])];
    arr.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "name") return a.full_name.localeCompare(b.full_name) * dir;
      if (sortKey === "overall") return (a.overall - b.overall) * dir;
      const av = (a as any)[`${sortKey}_actual`] ?? 0;
      const bv = (b as any)[`${sortKey}_actual`] ?? 0;
      return (av - bv) * dir;
    });
    return arr;
  }, [teamQ.data, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "name" ? "asc" : "desc"); }
  }

  function exportXlsx() {
    const ws = XLSX.utils.json_to_sheet(sorted.map(r => ({
      Rep: r.full_name, Email: r.email,
      Revenue_Actual: r.revenue_actual, Revenue_Target: r.revenue_target,
      Deals_Actual: r.deals_actual, Deals_Target: r.deals_target,
      Visits_Actual: r.visits_actual, Visits_Target: r.visits_target,
      Calls_Actual: r.calls_actual, Calls_Target: r.calls_target,
      Demos_Actual: r.demos_actual, Demos_Target: r.demos_target,
      Proposals_Actual: r.proposals_actual, Proposals_Target: r.proposals_target,
      Overall_Score: r.overall,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Team Scorecard");
    XLSX.writeFile(wb, `team-scorecard-${isoDate(period.start)}.xlsx`);
  }

  if (!isStaff) {
    return <div className="p-6 text-sm text-muted-foreground">Manager access required.</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Team Scorecard</h1>
          <p className="text-sm text-muted-foreground">{period.label}</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportXlsx} disabled={!sorted.length}>
          <Download className="mr-1.5 h-4 w-4" /> Export Excel
        </Button>
      </div>

      <Card className="overflow-hidden">
        {teamQ.isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <Th label="Rep" onClick={() => toggleSort("name")} active={sortKey === "name"} />
                  {KPI_DEFS.map(d => (
                    <Th key={d.key} label={d.label} onClick={() => toggleSort(d.key)} active={sortKey === d.key} />
                  ))}
                  <Th label="Score" onClick={() => toggleSort("overall")} active={sortKey === "overall"} />
                </tr>
              </thead>
              <tbody>
                {sorted.map(r => (
                  <tr key={r.user_id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{r.full_name}</td>
                    {KPI_DEFS.map(d => {
                      const a = (r as any)[`${d.key}_actual`] ?? 0;
                      const t = (r as any)[`${d.key}_target`] ?? 0;
                      const p = pctOf(a, t);
                      const rag = ragOf(p);
                      return (
                        <td key={d.key} className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="tabular-nums text-xs text-muted-foreground">
                              {d.currency ? formatBDT(a) : a}/{d.currency ? formatBDT(t) : t}
                            </span>
                            <Badge variant="outline" className={cn("text-[10px]", ragClasses(rag))}>
                              {p}%
                            </Badge>
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={cn("font-bold", ragClasses(ragOf(r.overall)))}>
                        {r.overall}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {!sorted.length && (
                  <tr><td colSpan={KPI_DEFS.length + 2} className="p-6 text-center text-muted-foreground">No team members.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Th({ label, onClick, active }: { label: string; onClick: () => void; active: boolean }) {
  return (
    <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
      <button onClick={onClick} className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}>
        {label} <ArrowUpDown className="h-3 w-3" />
      </button>
    </th>
  );
}
