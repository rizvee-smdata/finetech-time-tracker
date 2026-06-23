import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getRepIntegrityScores, getMyIntegrityVisible } from "@/lib/visit-analytics/integrity.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldAlert, TrendingDown, TrendingUp, MapPin, FileWarning } from "lucide-react";
import { ReasoningTooltip } from "@/components/visit-analytics/ReasoningTooltip";

export const Route = createFileRoute("/_authenticated/visits/integrity")({
  component: IntegrityReviewPage,
});

function pct(n: number) { return `${Math.round(n * 100)}%`; }

function IntegrityReviewPage() {
  const { isStaff, user } = useAuth();
  const userId = user?.id;
  const fetchScores = useServerFn(getRepIntegrityScores);
  const fetchVisible = useServerFn(getMyIntegrityVisible);
  const [periodDays, setPeriodDays] = useState<30 | 60 | 90>(30);

  const { data: vis } = useQuery({ queryKey: ["integrity-visible"], queryFn: () => fetchVisible({}) });
  const repAllowed = isStaff || vis?.visible;

  const { data, isLoading } = useQuery({
    queryKey: ["rep-integrity", periodDays],
    enabled: !!repAllowed,
    queryFn: () => fetchScores({ data: { periodDays } }),
  });

  if (!repAllowed) {
    return (
      <Card className="mx-auto mt-10 max-w-md p-6 text-center">
        <ShieldAlert className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm">Integrity review is admin-only. An admin can enable rep visibility in Visit Settings.</p>
      </Card>
    );
  }

  const rows = data?.rows ?? [];
  const visibleRows = isStaff ? rows : rows.filter((r) => r.user_id === userId);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Integrity Review</h1>
          <p className="text-sm text-muted-foreground">
            Geofence validity and visit quality. Informational only — no automated penalties.
          </p>
        </div>
        <Select value={String(periodDays)} onValueChange={(v) => setPeriodDays(Number(v) as 30 | 60 | 90)}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="60">Last 60 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </header>

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rep</TableHead>
              <TableHead className="text-right"><MapPin className="mr-1 inline h-3.5 w-3.5" />Geofence valid</TableHead>
              <TableHead className="text-right"><FileWarning className="mr-1 inline h-3.5 w-3.5" />Visit quality</TableHead>
              <TableHead className="text-right">Visits</TableHead>
              <TableHead className="text-right">Severity</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-xs text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!isLoading && visibleRows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-xs text-muted-foreground">No activity in this period.</TableCell></TableRow>
            )}
            {visibleRows.map((r) => {
              const gDown = r.trend.length >= 2 && r.trend[r.trend.length - 1].geofence_rate < r.trend[0].geofence_rate;
              const qDown = r.trend.length >= 2 && r.trend[r.trend.length - 1].quality_rate < r.trend[0].quality_rate;
              const reasoning = [
                `Check-ins: ${r.total_checkins} (${r.valid_geofence} inside geofence = ${pct(r.geofence_rate)})`,
                `Visits: ${r.total_visits} (${r.low_quality_visits} low-quality = ${pct(r.quality_rate)} quality rate)`,
                gDown ? "Geofence validity trending down over the last 4 weeks." : "Geofence validity stable or improving.",
                qDown ? "Visit quality trending down over the last 4 weeks." : "Visit quality stable or improving.",
              ];
              return (
                <TableRow key={r.user_id}>
                  <TableCell className="font-medium">{r.full_name}</TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center gap-1">
                      {gDown ? <TrendingDown className="h-3 w-3 text-amber-600" /> : <TrendingUp className="h-3 w-3 text-emerald-600" />}
                      {pct(r.geofence_rate)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center gap-1">
                      {qDown ? <TrendingDown className="h-3 w-3 text-amber-600" /> : <TrendingUp className="h-3 w-3 text-emerald-600" />}
                      {pct(r.quality_rate)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{r.total_visits}</TableCell>
                  <TableCell className="text-right">
                    {r.severity > 0.1 ? <Badge variant="destructive">High</Badge>
                      : r.severity > 0.03 ? <Badge variant="outline" className="border-amber-500 text-amber-700">Medium</Badge>
                      : <Badge variant="secondary">Stable</Badge>}
                  </TableCell>
                  <TableCell><ReasoningTooltip reasoning={reasoning} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-3 text-xs text-muted-foreground">
        <p><span className="font-medium text-foreground">How it's computed:</span> Geofence validity uses the <code>is_geofence_valid</code> field on every check-in. Visit quality flags visits with no next action and no meeting notes (see <a href="/visits/settings" className="underline">Visit Settings</a> to adjust the duration threshold). Severity ranks reps by decline over the trailing 4 weeks.</p>
      </Card>
    </div>
  );
}
