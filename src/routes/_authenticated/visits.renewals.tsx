import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getRenewalRadar } from "@/lib/visit-analytics/renewal.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/visits/renewals")({
  component: RenewalsPage,
});

const riskVariant = (r: string) => r === "high" ? "destructive" : r === "medium" ? "secondary" : "outline";

function RenewalsPage() {
  const fetchFn = useServerFn(getRenewalRadar);
  const [horizonDays, setHorizonDays] = useState<30 | 60 | 90 | 180>(90);
  const { data, isLoading } = useQuery({
    queryKey: ["renewal-radar", horizonDays],
    queryFn: () => fetchFn({ data: { horizonDays } }),
  });

  const rows = data?.rows ?? [];
  const high = rows.filter((r) => r.risk === "high").length;
  const value = rows.reduce((s, r) => s + (Number(r.expected_value) || 0), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Renewal Risk Radar</h1>
          <p className="text-sm text-muted-foreground">Upcoming renewals ranked by visit-coverage risk.</p>
        </div>
        <Select value={String(horizonDays)} onValueChange={(v) => setHorizonDays(Number(v) as 30 | 60 | 90 | 180)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Next 30 days</SelectItem>
            <SelectItem value="60">Next 60 days</SelectItem>
            <SelectItem value="90">Next 90 days</SelectItem>
            <SelectItem value="180">Next 180 days</SelectItem>
          </SelectContent>
        </Select>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Renewals in window</div><div className="text-2xl font-semibold">{rows.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">High risk</div><div className="text-2xl font-semibold text-rose-600">{high}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Pipeline value</div><div className="text-2xl font-semibold">{value.toLocaleString()}</div></Card>
      </div>

      <Card className="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead><TableHead>Renewal</TableHead><TableHead>Days</TableHead>
              <TableHead>Last visit</TableHead><TableHead>Rep</TableHead><TableHead>Risk</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={6}>Loading…</TableCell></TableRow> :
              rows.map((r) => (
                <TableRow key={r.lead_id}>
                  <TableCell>
                    <Link to="/crm/$leadId" params={{ leadId: r.lead_id }} className="font-medium hover:underline">{r.customer_name}</Link>
                    {r.company_name && <div className="text-xs text-muted-foreground">{r.company_name}</div>}
                  </TableCell>
                  <TableCell>{r.renewal_date}</TableCell>
                  <TableCell>{r.days_to_renewal}d</TableCell>
                  <TableCell>{r.last_visit_at ? `${r.days_since_visit}d ago` : <span className="text-rose-600">Never</span>}</TableCell>
                  <TableCell>{r.rep_name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={riskVariant(r.risk)}>{r.risk}</Badge>
                    <div className="mt-1 text-xs text-muted-foreground">{r.risk_reasons.join(" · ")}</div>
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-muted-foreground">No renewals in this window.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
