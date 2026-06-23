import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getAccountHealth } from "@/lib/visit-analytics/account-health.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HeartPulse } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/visits/account-health")({
  component: AccountHealthPage,
});

const ragClass = (r: string) =>
  r === "green"
    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : r === "amber"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
      : "bg-rose-500/15 text-rose-700 dark:text-rose-300";

function AccountHealthPage() {
  const fn = useServerFn(getAccountHealth);
  const { data, isLoading } = useQuery({
    queryKey: ["account-health-composite"],
    queryFn: () => fn({ data: {} }),
  });

  const rows = data?.rows ?? [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2">
        <HeartPulse className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Account Health Composite</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Blended score from visit cadence, quality, pipeline activity, and renewal proximity.
      </p>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No accounts.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Last Visit</TableHead>
                  <TableHead>Open Pipeline</TableHead>
                  <TableHead>Drivers</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.account_id}>
                    <TableCell className="font-medium">{r.account_name}</TableCell>
                    <TableCell>
                      <Badge className={ragClass(r.rag)}>{r.score}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.last_visit_days === null ? "Never" : `${r.last_visit_days}d ago`}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.open_deals_count} · ৳{r.open_deals_value.toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.drivers.map((d, i) => (
                          <Badge key={i} variant="outline" className="text-[10px]">{d}</Badge>
                        ))}
                        {r.renewal_risk && (
                          <Badge variant="destructive" className="text-[10px]">Renewal risk</Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
