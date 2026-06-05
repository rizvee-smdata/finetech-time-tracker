import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { getTeamLatestPredictions, fmtBdt, riskBand, type PredictionRun } from "@/lib/predictor";

export const Route = createFileRoute("/_authenticated/predictor/team")({
  component: TeamPredictorPage,
});

function TeamPredictorPage() {
  const { companyId, isStaff } = useAuth();

  const { data: predictions = [], isLoading } = useQuery({
    queryKey: ["predictions-team", companyId],
    enabled: !!companyId && isStaff,
    queryFn: () => getTeamLatestPredictions(companyId!),
  });

  const userIds = predictions.map((p) => p.user_id);
  const { data: profiles = [] } = useQuery({
    queryKey: ["predictor-profiles", userIds],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await (supabase as any).from("profiles").select("id, full_name").in("id", userIds);
      return (data ?? []) as Array<{ id: string; full_name: string }>;
    },
  });
  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.full_name ?? id.slice(0, 8);

  if (!isStaff) {
    return <div className="p-8 text-sm text-muted-foreground">Manager access required.</div>;
  }
  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  const sorted = [...predictions].sort((a, b) => a.achievement_pct - b.achievement_pct);
  const teamTarget = predictions.reduce((s, p) => s + Number(p.target_value), 0);
  const teamPredicted = predictions.reduce((s, p) => s + Number(p.predicted_revenue), 0);
  const teamPct = teamTarget > 0 ? Math.round((teamPredicted / teamTarget) * 100) : 0;

  return (
    <div className="container mx-auto max-w-6xl py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" /> Team Predictor
        </h1>
        <p className="text-sm text-muted-foreground">Latest AI forecasts for the current month, ranked by risk.</p>
      </div>

      <Card className="p-5 bg-gradient-to-br from-primary/5 to-card">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Team target</div>
            <div className="text-2xl font-bold">{fmtBdt(teamTarget)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Team predicted</div>
            <div className="text-2xl font-bold">{fmtBdt(teamPredicted)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Team achievement</div>
            <div className={`text-2xl font-bold ${teamPct >= 90 ? "text-success" : teamPct >= 70 ? "text-warning" : "text-destructive"}`}>
              {teamPct}%
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rep</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Achieved</TableHead>
              <TableHead>Predicted</TableHead>
              <TableHead>%</TableHead>
              <TableHead>Trend</TableHead>
              <TableHead>Risk</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p) => (
              <RepRow key={p.id} p={p} repName={nameOf(p.user_id)} />
            ))}
            {sorted.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">No predictions yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function RepRow({ p, repName }: { p: PredictionRun; repName: string }) {
  const band = riskBand(p.achievement_pct);
  const pctRate = p.inputs.target_value > 0 ? (p.achieved_value / p.inputs.target_value) : 0;
  const expectedRate = p.inputs.ratio_elapsed;
  const trend = pctRate > expectedRate * 1.05 ? "up" : pctRate < expectedRate * 0.85 ? "down" : "flat";
  return (
    <TableRow className="cursor-pointer hover:bg-muted/30">
      <TableCell>
        <Link to="/predictor/me" className="font-medium hover:underline">{repName}</Link>
      </TableCell>
      <TableCell>{fmtBdt(p.target_value)}</TableCell>
      <TableCell>{fmtBdt(p.achieved_value)}</TableCell>
      <TableCell>{fmtBdt(p.predicted_revenue)}</TableCell>
      <TableCell className="font-semibold">{p.achievement_pct}%</TableCell>
      <TableCell>
        {trend === "up" ? <TrendingUp className="h-4 w-4 text-success" />
          : trend === "down" ? <TrendingDown className="h-4 w-4 text-destructive" />
          : <Minus className="h-4 w-4 text-muted-foreground" />}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={
          band === "on_track" ? "text-success border-success/40"
          : band === "at_risk" ? "text-warning border-warning/40"
          : "text-destructive border-destructive/40"
        }>
          {band === "on_track" ? "On Track" : band === "at_risk" ? "At Risk" : "Critical"}
        </Badge>
      </TableCell>
    </TableRow>
  );
}
