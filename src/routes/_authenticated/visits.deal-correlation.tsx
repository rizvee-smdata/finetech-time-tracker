import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getDealCorrelation } from "@/lib/visit-analytics/correlation.functions";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/visits/deal-correlation")({
  component: DealCorrelationPage,
});

function DealCorrelationPage() {
  const fetchFn = useServerFn(getDealCorrelation);
  const [periodDays, setPeriodDays] = useState<90 | 180 | 365>(180);
  const { data, isLoading } = useQuery({
    queryKey: ["deal-correlation", periodDays],
    queryFn: () => fetchFn({ data: { periodDays } }),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Visit ↔ Deal Correlation</h1>
          <p className="text-sm text-muted-foreground">
            How pre-close visit cadence correlates with win-rate. 90-day visit window before each closure.
          </p>
        </div>
        <Select value={String(periodDays)} onValueChange={(v) => setPeriodDays(Number(v) as 90 | 180 | 365)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="180">Last 180 days</SelectItem>
            <SelectItem value="365">Last 365 days</SelectItem>
          </SelectContent>
        </Select>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Won</div><div className="text-2xl font-semibold">{data?.totalWon ?? "—"}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Lost</div><div className="text-2xl font-semibold">{data?.totalLost ?? "—"}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Avg visits before win</div><div className="text-2xl font-semibold text-emerald-600">{data?.avgVisitsWon ?? "—"}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Avg visits before loss</div><div className="text-2xl font-semibold text-rose-600">{data?.avgVisitsLost ?? "—"}</div></Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium"><TrendingUp className="h-4 w-4" /> Win-rate by visit count</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.winRateBuckets ?? []}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="bucket" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="winRate" fill="hsl(var(--primary))" name="Win-rate %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-medium">Top reps by wins</h2>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Rep</TableHead><TableHead>Wins</TableHead><TableHead>Avg visits / win</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={3}>Loading…</TableCell></TableRow> :
              (data?.topReps ?? []).map((r) => (
                <TableRow key={r.user_id}><TableCell>{r.full_name}</TableCell><TableCell>{r.wins}</TableCell><TableCell>{r.avgVisits}</TableCell></TableRow>
              ))}
            {!isLoading && (data?.topReps ?? []).length === 0 && <TableRow><TableCell colSpan={3} className="text-muted-foreground">No closed deals in this period.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
