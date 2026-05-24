import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { fetchTargets } from "@/lib/targets/queries";
import { computeTargetActual } from "@/lib/targets/queries";
import { fetchCompanyMembers } from "@/lib/crm/queries";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Trophy, Medal, Award } from "lucide-react";
import { formatTargetValue } from "@/lib/targets/types";

export const Route = createFileRoute("/_authenticated/targets/leaderboard")({
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const { companyId } = useAuth();
  const today = new Date().toISOString().slice(0, 10);

  const targets = useQuery({
    queryKey: ["targets", companyId],
    enabled: !!companyId,
    queryFn: () => fetchTargets(companyId!),
  });

  const members = useQuery({
    queryKey: ["company-members", companyId],
    enabled: !!companyId,
    queryFn: () => fetchCompanyMembers(companyId!),
  });

  const active = useMemo(
    () => (targets.data ?? []).filter((t) => t.scope === "user" && t.period_start <= today && t.period_end >= today),
    [targets.data, today],
  );

  const actuals = useQueries({
    queries: active.map((t) => ({
      queryKey: ["target-actual", t.id, t.updated_at],
      queryFn: () => computeTargetActual(t),
    })),
  });

  const memberMap = new Map((members.data ?? []).map((m: any) => [m.id, m.full_name ?? m.email] as const));

  const rows = active.map((t, i) => {
    const value = actuals[i].data ?? 0;
    const pct = (value / Number(t.target_value)) * 100;
    return {
      target: t,
      name: memberMap.get(t.user_id ?? "") ?? "Unknown",
      value,
      pct,
    };
  }).sort((a, b) => b.pct - a.pct);

  if (targets.isLoading) return <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>;
  if (!rows.length) return <Card className="p-8 text-center text-sm text-muted-foreground">No active per-rep targets to rank.</Card>;

  const medal = (rank: number) =>
    rank === 0 ? <Trophy className="h-4 w-4 text-amber-500" />
    : rank === 1 ? <Medal className="h-4 w-4 text-slate-400" />
    : rank === 2 ? <Award className="h-4 w-4 text-orange-500" />
    : <span className="w-4 text-center text-xs font-semibold text-muted-foreground">{rank + 1}</span>;

  return (
    <Card className="divide-y">
      {rows.map((r, i) => (
        <div key={r.target.id} className="flex items-center gap-3 p-3">
          <div className="flex w-6 justify-center">{medal(i)}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-sm font-medium">{r.name}</div>
              <div className="text-xs text-muted-foreground">{Math.round(r.pct)}%</div>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {formatTargetValue(r.target.metric, r.value, r.target.currency)} /{" "}
              {formatTargetValue(r.target.metric, Number(r.target.target_value), r.target.currency)}
            </div>
            <Progress value={Math.min(100, r.pct)} className="mt-1.5 h-1.5" />
          </div>
        </div>
      ))}
    </Card>
  );
}
