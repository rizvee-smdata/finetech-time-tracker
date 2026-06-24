import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getOemRepMatrix, type MatrixCell } from "@/lib/visit-analytics/oem-rep-matrix.functions";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBDT } from "@/lib/crm/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/visits/oem-rep-matrix")({
  component: OemRepMatrixPage,
});

type Metric = "leads" | "pipeline_value" | "won_value";

function OemRepMatrixPage() {
  const fetchFn = useServerFn(getOemRepMatrix);
  const { companyId } = useAuth();
  const [periodDays, setPeriodDays] = useState<30 | 90 | 180 | 365>(90);
  const [metric, setMetric] = useState<Metric>("leads");

  const { data, isLoading } = useQuery({
    queryKey: ["oem-rep-matrix", companyId, periodDays],
    enabled: !!companyId,
    queryFn: () => fetchFn({ data: { periodDays, companyId } }),
  });

  const cellIndex = useMemo(() => {
    const m = new Map<string, MatrixCell>();
    (data?.cells ?? []).forEach((c) => m.set(`${c.oem_id}|${c.rep_id}`, c));
    return m;
  }, [data]);

  const fmt = (v: number) => metric === "leads" ? String(v) : formatBDT(v);

  const cellValue = (c: MatrixCell | undefined) => {
    if (!c) return 0;
    return c[metric];
  };

  const oems = data?.oems ?? [];
  const reps = data?.reps ?? [];

  // Heatmap intensity
  const maxVal = useMemo(() => {
    let max = 0;
    for (const c of data?.cells ?? []) max = Math.max(max, c[metric]);
    return max || 1;
  }, [data, metric]);

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vendor × Rep Matrix</h1>
          <p className="text-sm text-muted-foreground">
            Leads, open pipeline and won value by vendor (OEM or product) and salesperson.
            Falls back to product name when an OEM is not linked.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={metric} onValueChange={(v) => setMetric(v as Metric)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="leads">Lead count</SelectItem>
              <SelectItem value="pipeline_value">Open pipeline value</SelectItem>
              <SelectItem value="won_value">Won value</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(periodDays)} onValueChange={(v) => setPeriodDays(Number(v) as 30 | 90 | 180 | 365)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="180">Last 180 days</SelectItem>
              <SelectItem value="365">Last 365 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : oems.length === 0 || reps.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No vendor/product leads in this period.</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-muted/50 sticky top-0 z-10">
                <tr>
                  <th className="sticky left-0 z-20 bg-muted/50 px-3 py-2 text-left font-semibold border-b border-r">OEM \ Rep</th>
                  {reps.map((r) => (
                    <th key={r.id} className="px-3 py-2 text-right font-medium whitespace-nowrap border-b">
                      {r.name}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-semibold border-b border-l bg-muted">Total</th>
                </tr>
              </thead>
              <tbody>
                {oems.map((o) => {
                  const total = data!.oem_totals[o.id];
                  const totalVal = total ? total[metric === "leads" ? "leads" : metric] : 0;
                  return (
                    <tr key={o.id} className="border-t">
                      <td className="sticky left-0 bg-background px-3 py-2 font-medium border-r whitespace-nowrap">
                        {o.name}
                        {total && (
                          <div className="text-xs text-muted-foreground font-normal">
                            {total.leads} leads · {total.reps} reps
                          </div>
                        )}
                      </td>
                      {reps.map((r) => {
                        const c = cellIndex.get(`${o.id}|${r.id}`);
                        const v = cellValue(c);
                        const intensity = v > 0 ? Math.min(1, v / maxVal) : 0;
                        return (
                          <td
                            key={r.id}
                            className={cn(
                              "px-3 py-2 text-right tabular-nums",
                              v === 0 && "text-muted-foreground/40",
                            )}
                            style={v > 0 ? { backgroundColor: `hsl(var(--primary) / ${0.08 + intensity * 0.32})` } : undefined}
                            title={c ? `${c.leads} leads · ${c.won} won · ${c.lost} lost` : "—"}
                          >
                            {v > 0 ? fmt(v) : "—"}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right tabular-nums font-semibold border-l bg-muted/30">
                        {fmt(totalVal)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 bg-muted/40">
                  <td className="sticky left-0 bg-muted/40 px-3 py-2 font-semibold border-r">Total</td>
                  {reps.map((r) => {
                    const t = data!.rep_totals[r.id];
                    const v = t ? t[metric === "leads" ? "leads" : metric] : 0;
                    return (
                      <td key={r.id} className="px-3 py-2 text-right tabular-nums font-semibold">
                        {v > 0 ? fmt(v) : "—"}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right tabular-nums font-bold border-l bg-muted">
                    {fmt((data?.cells ?? []).reduce((s, c) => s + c[metric], 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        Hover any cell to see leads / won / lost counts. Color intensity reflects relative value within the current metric.
      </p>
    </div>
  );
}
