import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Sparkles } from "lucide-react";
import {
  computeAttribution,
  listRecentTouches,
  type AttributionModel,
} from "@/lib/attribution/attribution.functions";

export const Route = createFileRoute("/_authenticated/reports/attribution")({
  head: () => ({
    meta: [
      { title: "Revenue Attribution — Lavisho TT" },
      { name: "description", content: "See which sources, channels, and campaigns drive won revenue across your pipeline." },
    ],
  }),
  component: AttributionPage,
});

const MODELS: { value: AttributionModel; label: string; hint: string }[] = [
  { value: "first_touch", label: "First-touch", hint: "100% credit to the first interaction" },
  { value: "last_touch", label: "Last-touch", hint: "100% credit to the last interaction before conversion" },
  { value: "linear", label: "Linear", hint: "Equal credit across every touch" },
  { value: "time_decay", label: "Time-decay", hint: "More credit to recent touches (7-day half-life)" },
  { value: "u_shaped", label: "U-shaped", hint: "40% first, 40% last, 20% split across middle" },
];

function AttributionPage() {
  const { companyId, isStaff } = useAuth();
  const [model, setModel] = useState<AttributionModel>("linear");

  const compute = useServerFn(computeAttribution);
  const listTouches = useServerFn(listRecentTouches);

  const attribution = useQuery({
    queryKey: ["attribution", companyId, model],
    queryFn: () => compute({ data: { companyId: companyId!, model } }),
    enabled: !!companyId && isStaff,
  });

  const recent = useQuery({
    queryKey: ["attribution-touches", companyId],
    queryFn: () => listTouches({ data: { companyId: companyId!, limit: 50 } }),
    enabled: !!companyId && isStaff,
  });

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

  const modelHint = useMemo(() => MODELS.find((m) => m.value === model)?.hint ?? "", [model]);

  if (!companyId) return <p className="p-6 text-sm text-muted-foreground">Select a company first.</p>;
  if (!isStaff) {
    return (
      <div className="p-8">
        <Card className="p-6">
          <h1 className="text-lg font-semibold">Admins & managers only</h1>
          <p className="mt-1 text-sm text-muted-foreground">You don't have access to this page.</p>
        </Card>
      </div>
    );
  }

  const totals = attribution.data?.totals;
  const breakdown = attribution.data?.breakdown ?? [];
  const totalCredit = breakdown.reduce((a, b) => a + b.credit, 0);
  const bySource = new Map<string, number>();
  for (const row of breakdown) bySource.set(row.source, (bySource.get(row.source) ?? 0) + row.credit);
  const sourceRows = Array.from(bySource.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <TrendingUp className="h-6 w-6" /> Revenue Attribution
          </h1>
          <p className="text-sm text-muted-foreground">
            Which sources, channels, and campaigns actually drive closed-won revenue.
          </p>
        </div>
        <div className="min-w-[220px]">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Attribution model</label>
          <Select value={model} onValueChange={(v) => setModel(v as AttributionModel)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MODELS.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">{modelHint}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground">Attributed revenue</div>
          <div className="mt-1 text-2xl font-semibold">{formatCurrency(totals?.attributedRevenue ?? 0)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground">Won deals</div>
          <div className="mt-1 text-2xl font-semibold">{totals?.deals ?? 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground">Total touchpoints</div>
          <div className="mt-1 text-2xl font-semibold">{totals?.touches ?? 0}</div>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4" /> Credit by source
        </h2>
        {attribution.isLoading ? (
          <p className="text-sm text-muted-foreground">Computing…</p>
        ) : sourceRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No won deals with touchpoints yet.</p>
        ) : (
          <div className="space-y-2">
            {sourceRows.map(([source, credit]) => {
              const pct = totalCredit ? (credit / totalCredit) * 100 : 0;
              return (
                <div key={source}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium">{source || "unknown"}</span>
                    <span className="tabular-nums text-muted-foreground">{formatCurrency(credit)} · {pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Channel & campaign leaderboard</h2>
        {breakdown.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead className="text-right">Deals</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdown.slice(0, 50).map((row, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{row.source || "—"}</TableCell>
                  <TableCell>{row.channel || "—"}</TableCell>
                  <TableCell>{row.campaign || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.deals.toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(row.credit)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Recent touchpoints</h2>
        {recent.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (recent.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No touches recorded yet. Create a lead or log an activity to populate this feed.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(recent.data ?? []).map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(t.occurred_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.touch_kind === "conversion" ? "default" : "secondary"}>{t.touch_kind}</Badge>
                  </TableCell>
                  <TableCell>{t.source}</TableCell>
                  <TableCell>{t.channel || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {t.revenue_value ? formatCurrency(Number(t.revenue_value)) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
