import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getRepLeaderboard } from "@/lib/visit-analytics/territory.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy, Medal } from "lucide-react";

export const Route = createFileRoute("/_authenticated/visits/leaderboard")({
  component: LeaderboardPage,
  errorComponent: ({ error }) => <div className="p-4 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-4">Not found</div>,
});

function LeaderboardPage() {
  const [days, setDays] = useState(30);
  const fn = useServerFn(getRepLeaderboard);
  const { data, isLoading } = useQuery({
    queryKey: ["visits", "leaderboard", days],
    queryFn: () => fn({ data: { days } }),
  });

  const rows = data?.rows ?? [];

  const rankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="h-4 w-4 text-yellow-500" />;
    if (rank === 2) return <Medal className="h-4 w-4 text-slate-400" />;
    if (rank === 3) return <Medal className="h-4 w-4 text-amber-700" />;
    return <span className="text-xs text-muted-foreground">#{rank}</span>;
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Field Leaderboard</h1>
          <p className="text-sm text-muted-foreground">
            Composite ranking across visits, quality, pipeline, and revenue.
          </p>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </header>

      {isLoading && <div className="text-sm text-muted-foreground">Loading rankings…</div>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Performers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="text-left py-2 w-12">Rank</th>
                  <th className="text-left">Rep</th>
                  <th className="text-right">Visits</th>
                  <th className="text-right">Accounts</th>
                  <th className="text-right">Quality</th>
                  <th className="text-right">Pipeline</th>
                  <th className="text-right">Won</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.user_id} className="border-b last:border-0">
                    <td className="py-2">{rankIcon(r.rank)}</td>
                    <td className="font-medium">{r.rep_name}</td>
                    <td className="text-right">{r.visits}</td>
                    <td className="text-right">{r.unique_accounts}</td>
                    <td className="text-right">{r.quality_visits}</td>
                    <td className="text-right">{r.pipeline_generated.toLocaleString()}</td>
                    <td className="text-right">{r.deals_won}</td>
                    <td className="text-right">{r.revenue_won.toLocaleString()}</td>
                    <td className="text-right">
                      <Badge variant="secondary">{r.score}</Badge>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && !isLoading && (
                  <tr><td colSpan={9} className="py-4 text-muted-foreground text-center">No activity in window</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
