import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ScoreGauge } from "@/components/scorecard/ScoreGauge";
import { KpiCard } from "@/components/scorecard/KpiCard";
import { KPI_DEFS, isoDate, overallScore, pastMonths } from "@/lib/scorecard/scoring";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/scorecard/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const { user, companyId } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);

  const months = useMemo(() => pastMonths(12), []);

  const listQ = useQuery({
    queryKey: ["scorecard-history", user?.id, companyId],
    enabled: !!user?.id && !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("performance_snapshots")
        .select("*")
        .eq("user_id", user!.id)
        .eq("company_id", companyId!)
        .order("period_start", { ascending: false });
      return data ?? [];
    },
  });

  const byKey = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of listQ.data ?? []) m.set(`${r.period_start}_${r.period_end}`, r);
    return m;
  }, [listQ.data]);

  const cards = months.map((m) => {
    const key = `${isoDate(m.start)}_${isoDate(m.end)}`;
    const snap = byKey.get(key);
    return { ...m, snap, key };
  }).reverse();

  if (selected) {
    const card = cards.find(c => c.key === selected);
    const row = card?.snap;
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
        <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Back to history
        </Button>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xl font-semibold">{card?.label}</div>
              <div className="text-sm text-muted-foreground">Saved snapshot</div>
            </div>
            <ScoreGauge score={row?.overall_score ?? 0} size={120} />
          </div>
        </Card>
        <div className="grid gap-3 md:grid-cols-3">
          {KPI_DEFS.map((d) => (
            <KpiCard
              key={d.key}
              label={d.label}
              actual={Number(row?.[`${d.key}_actual`] ?? 0)}
              target={Number(row?.[`${d.key}_target`] ?? 0)}
              currency={d.currency}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Scorecard History</h1>
        <p className="text-sm text-muted-foreground">Past 12 months of saved snapshots.</p>
      </div>
      {listQ.isLoading ? (
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          {cards.map((c) => {
            const has = !!c.snap;
            return (
              <button
                key={c.key}
                onClick={() => has && setSelected(c.key)}
                disabled={!has}
                className="text-left disabled:opacity-50"
              >
                <Card className="p-4 transition hover:border-primary disabled:hover:border-border">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{c.label}</div>
                    {has ? (
                      <Badge variant="outline">{Math.round(Number(c.snap.overall_score))}%</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">—</Badge>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {has ? "Click to view" : "No snapshot"}
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
