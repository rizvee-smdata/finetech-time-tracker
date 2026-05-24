import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, MessageSquare, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SurveyResponse } from "@/lib/surveys/types";
import { SENTIMENT_CLASS, SENTIMENT_LABEL } from "@/lib/surveys/types";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/surveys/")({
  component: SurveysListPage,
});

function SurveysListPage() {
  const { companyId } = useAuth();

  const responses = useQuery({
    queryKey: ["survey-responses", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("survey_responses")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as SurveyResponse[];
    },
  });

  const stats = useMemo(() => {
    const list = responses.data ?? [];
    const total = list.length;
    const withRating = list.filter((r) => r.rating != null);
    const avg = withRating.length
      ? withRating.reduce((s, r) => s + (r.rating ?? 0), 0) / withRating.length
      : 0;
    const negative = list.filter((r) => r.sentiment === "negative").length;
    const followUps = list.filter((r) => r.follow_up_required).length;
    return { total, avg, negative, followUps };
  }, [responses.data]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total responses" value={stats.total.toString()} icon={<MessageSquare className="h-4 w-4" />} />
        <StatCard label="Avg rating" value={stats.avg ? stats.avg.toFixed(1) : "—"} icon={<Star className="h-4 w-4" />} />
        <StatCard label="Negative" value={stats.negative.toString()} icon={<AlertTriangle className="h-4 w-4" />} />
        <StatCard label="Need follow-up" value={stats.followUps.toString()} icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {responses.isLoading ? "Loading…" : `${stats.total} recent response${stats.total === 1 ? "" : "s"}`}
        </div>
        <Button asChild size="sm">
          <Link to="/surveys/new">Submit feedback</Link>
        </Button>
      </div>

      {(responses.data ?? []).length === 0 && !responses.isLoading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No feedback captured yet. After your next visit, submit a quick form to log how it went.
        </Card>
      ) : (
        <div className="space-y-2">
          {(responses.data ?? []).map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.customer_name ?? "Customer"}</span>
                    {r.sentiment && (
                      <Badge className={SENTIMENT_CLASS[r.sentiment]} variant="secondary">
                        {SENTIMENT_LABEL[r.sentiment]}
                      </Badge>
                    )}
                    {r.follow_up_required && (
                      <Badge variant="outline" className="text-xs">
                        Follow up{r.follow_up_at ? ` · ${r.follow_up_at}` : ""}
                      </Badge>
                    )}
                  </div>
                  {r.notes && <p className="text-sm text-muted-foreground">{r.notes}</p>}
                  <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
                </div>
                {r.rating != null && (
                  <div className="flex items-center gap-0.5 text-amber-400">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={cn("h-3.5 w-3.5", i < (r.rating ?? 0) ? "fill-current" : "opacity-30")}
                      />
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </Card>
  );
}
