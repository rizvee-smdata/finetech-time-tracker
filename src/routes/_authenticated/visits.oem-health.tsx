import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getOemHealth } from "@/lib/visit-analytics/oem.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/visits/oem-health")({
  component: OemHealthPage,
});

const healthVariant = (h: string) => h === "at_risk" ? "destructive" : h === "watch" ? "secondary" : "outline";

function OemHealthPage() {
  const fetchFn = useServerFn(getOemHealth);
  const { companyId } = useAuth();
  const [periodDays, setPeriodDays] = useState<30 | 90 | 180 | 365>(90);
  const { data, isLoading } = useQuery({
    queryKey: ["oem-health", companyId, periodDays],
    enabled: !!companyId,
    queryFn: () => fetchFn({ data: { periodDays, companyId } }),
  });

  const rows = data?.rows ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">OEM Partner Health</h1>
          <p className="text-sm text-muted-foreground">Pipeline, win-rate and visit coverage by vendor, using product name when no OEM is linked.</p>
        </div>
        <Select value={String(periodDays)} onValueChange={(v) => setPeriodDays(Number(v) as 30 | 90 | 180 | 365)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="180">Last 180 days</SelectItem>
            <SelectItem value="365">Last 365 days</SelectItem>
          </SelectContent>
        </Select>
      </header>

      <Card className="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>OEM</TableHead><TableHead>Active</TableHead><TableHead>Won</TableHead>
              <TableHead>Won value</TableHead><TableHead>Win-rate</TableHead>
              <TableHead>Visits</TableHead><TableHead>Health</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={7}>Loading…</TableCell></TableRow> :
              rows.map((r) => (
                <TableRow key={r.oem_id}>
                  <TableCell className="font-medium">{r.oem_name}</TableCell>
                  <TableCell>{r.active_leads}</TableCell>
                  <TableCell>{r.won_count}</TableCell>
                  <TableCell>{r.won_value.toLocaleString()}</TableCell>
                  <TableCell>{r.win_rate}%</TableCell>
                  <TableCell>{r.total_visits} <span className="text-xs text-muted-foreground">({r.unique_accounts_visited} accts)</span></TableCell>
                  <TableCell>
                    <Badge variant={healthVariant(r.health)}>{r.health.replace("_", " ")}</Badge>
                    <div className="mt-1 text-xs text-muted-foreground">{r.reasons.join(" · ")}</div>
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-muted-foreground">No vendor/product leads in this period.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
