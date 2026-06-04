import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, RefreshCw, TrendingUp, Target, Trophy, Lightbulb, Users, Flame, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { generateInsights, weekOfLabel, type CoachingInsight } from "@/lib/coaching";

export const Route = createFileRoute("/_authenticated/coach/me")({
  component: CoachMePage,
});

function CoachMePage() {
  const { user, companyId } = useAuth();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: insight, isLoading } = useQuery({
    queryKey: ["coaching-insight-latest", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("coaching_insights" as never)
        .select("*")
        .eq("user_id", user!.id)
        .order("week_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as CoachingInsight | null;
    },
  });

  const refresh = useMutation({
    mutationFn: () => generateInsights(undefined, companyId ?? undefined, !!insight),
    onMutate: () => setRefreshing(true),
    onSettled: () => setRefreshing(false),
    onSuccess: () => {
      toast.success("Fresh insights ready");
      qc.invalidateQueries({ queryKey: ["coaching-insight-latest"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to generate insights"),
  });

  const snap = (insight?.data_snapshot ?? {}) as Record<string, any>;
  const streak = Number(snap.consecutive_visit_days ?? 0);
  const wonStreak = Number(snap.deals_won ?? 0);

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Your Weekly Sales Coach
          </h1>
          <p className="text-muted-foreground text-sm">
            {insight ? `Week of ${weekOfLabel(insight.week_start)}` : "Generate this week's insights to get started"}
          </p>
        </div>
        <Button onClick={() => refresh.mutate()} disabled={refreshing || refresh.isPending} variant="default">
          {refreshing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          {insight ? "Regenerate Insights" : "Generate Insights"}
        </Button>
      </div>

      {isLoading ? (
        <Card className="p-6">Loading…</Card>
      ) : !insight ? (
        <Card className="p-8 text-center bg-gradient-to-br from-primary/5 to-accent/5 border-dashed">
          <Sparkles className="h-10 w-10 text-primary mx-auto mb-3" />
          <h2 className="text-lg font-semibold mb-1">No insights yet</h2>
          <p className="text-muted-foreground text-sm mb-4">
            Tap "Generate Insights" to let your AI coach analyze the last 28 days of your activity.
          </p>
        </Card>
      ) : (
        <>
          {/* Performance summary */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <StatCard label="Deals Won" value={snap.deals_won ?? 0} />
            <StatCard label="Close Rate" value={`${snap.close_rate_pct ?? 0}%`} />
            <StatCard label="Visits" value={snap.visits ?? 0} />
            <StatCard label="Engagement" value={`${insight.engagement_score ?? "—"}/10`} accent />
          </div>

          {/* Streak badges */}
          <div className="flex flex-wrap gap-2">
            {streak >= 3 && (
              <Badge variant="secondary" className="gap-1 py-1.5">
                <Flame className="h-3.5 w-3.5 text-orange-500" /> Visited clients {streak} days in a row
              </Badge>
            )}
            {wonStreak >= 3 && (
              <Badge variant="secondary" className="gap-1 py-1.5">
                <Trophy className="h-3.5 w-3.5 text-amber-500" /> {wonStreak} deals closed this month
              </Badge>
            )}
            {Number(snap.calls ?? 0) >= 20 && (
              <Badge variant="secondary" className="gap-1 py-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" /> {snap.calls} calls logged
              </Badge>
            )}
          </div>

          {/* Insight cards */}
          <InsightCard
            icon={<Trophy className="h-5 w-5 text-green-600" />}
            title="Your Strength This Week"
            body={insight.strength}
            tone="green"
            evidence={`Based on ${snap.deals_won ?? 0} won deals and ${snap.visits ?? 0} visits in the last 28 days.`}
          />
          <InsightCard
            icon={<Target className="h-5 w-5 text-amber-600" />}
            title="Your Focus Area"
            body={insight.focus_area}
            tone="amber"
            evidence={`Team revenue avg: ${(snap.team_revenue_avg ?? 0).toLocaleString()} | You: ${(snap.revenue ?? 0).toLocaleString()}`}
          />
          <InsightCard
            icon={<Lightbulb className="h-5 w-5 text-blue-600" />}
            title="Your Win Pattern"
            body={insight.win_pattern}
            tone="blue"
            evidence={`Best day: ${snap.best_day ?? "—"} (${snap.best_day_count ?? 0} wins). Top industries: ${(snap.top_industries ?? []).join(", ") || "—"}`}
          />
          <ActionsCard actions={insight.actions ?? []} />
          <InsightCard
            icon={<Users className="h-5 w-5 text-purple-600" />}
            title="Team Benchmark"
            body={
              `You closed ${snap.deals_won ?? 0} deals vs team avg ` +
              `${Math.round(((snap.team_revenue_avg ?? 0) / Math.max(1, snap.revenue || 1)) * (snap.deals_won || 0)) || 0}, ` +
              `and made ${snap.visits ?? 0} visits vs team avg ${snap.team_visit_avg ?? 0}.`
            }
            tone="purple"
            evidence="Compared anonymously across active peers in your company."
          />

          {insight.motivational_message && (
            <Card className="p-5 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/5 border-primary/20">
              <div className="flex gap-3 items-start">
                <Sparkles className="h-5 w-5 text-primary mt-0.5" />
                <p className="text-base italic">{insight.motivational_message}</p>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: any; accent?: boolean }) {
  return (
    <Card className={`p-4 ${accent ? "bg-primary/5 border-primary/20" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </Card>
  );
}

function InsightCard({
  icon, title, body, tone, evidence,
}: {
  icon: React.ReactNode;
  title: string;
  body: string | null;
  tone: "green" | "amber" | "blue" | "purple";
  evidence?: string;
}) {
  const toneMap: Record<string, string> = {
    green: "border-l-green-500",
    amber: "border-l-amber-500",
    blue: "border-l-blue-500",
    purple: "border-l-purple-500",
  };
  if (!body) return null;
  return (
    <Card className={`p-5 border-l-4 ${toneMap[tone]}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="font-semibold">{title}</h3>
        <Sparkles className="h-3.5 w-3.5 text-primary ml-auto opacity-60" />
      </div>
      <p className="text-sm leading-relaxed">{body}</p>
      {evidence && (
        <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">{evidence}</p>
      )}
    </Card>
  );
}

function ActionsCard({ actions }: { actions: string[] }) {
  if (!actions.length) return null;
  return (
    <Card className="p-5 border-l-4 border-l-primary">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Your 3 Actions This Week</h3>
        <Sparkles className="h-3.5 w-3.5 text-primary ml-auto opacity-60" />
      </div>
      <ol className="space-y-2">
        {actions.map((a, i) => (
          <li key={i} className="flex gap-3 items-start">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
              {i + 1}
            </span>
            <span className="text-sm leading-relaxed pt-0.5">{a}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
