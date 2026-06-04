import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { weekOfLabel, type CoachingInsight } from "@/lib/coaching";

export const Route = createFileRoute("/_authenticated/coach/history")({
  component: CoachHistoryPage,
});

function CoachHistoryPage() {
  const { user } = useAuth();
  const { data: insights = [], isLoading } = useQuery({
    queryKey: ["coaching-insights-history", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("coaching_insights" as never)
        .select("*")
        .eq("user_id", user!.id)
        .order("week_start", { ascending: false });
      return (data ?? []) as CoachingInsight[];
    },
  });

  return (
    <div className="container mx-auto py-6 max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" /> Past Coaching Insights
        </h1>
        <p className="text-muted-foreground text-sm">Tap any week to expand.</p>
      </div>

      {isLoading ? (
        <Card className="p-6">Loading…</Card>
      ) : insights.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">No insights yet.</Card>
      ) : (
        <Card>
          <Accordion type="single" collapsible className="w-full">
            {insights.map((i) => (
              <AccordionItem key={i.id} value={i.id}>
                <AccordionTrigger className="px-4">
                  <div className="flex items-center gap-3 flex-1 text-left">
                    <span className="font-medium">Week of {weekOfLabel(i.week_start)}</span>
                    {i.engagement_score != null && (
                      <Badge variant="outline" className="ml-auto mr-2">
                        Score {i.engagement_score}/10
                      </Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 space-y-3">
                  {i.strength && <Field label="Strength" value={i.strength} />}
                  {i.focus_area && <Field label="Focus Area" value={i.focus_area} />}
                  {i.win_pattern && <Field label="Win Pattern" value={i.win_pattern} />}
                  {i.actions?.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Actions</div>
                      <ol className="list-decimal list-inside space-y-1 text-sm">
                        {i.actions.map((a, idx) => <li key={idx}>{a}</li>)}
                      </ol>
                    </div>
                  )}
                  {i.motivational_message && (
                    <p className="italic text-sm text-muted-foreground border-l-2 border-primary/40 pl-3">
                      {i.motivational_message}
                    </p>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">{label}</div>
      <p className="text-sm">{value}</p>
    </div>
  );
}
