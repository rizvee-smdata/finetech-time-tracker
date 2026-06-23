import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { generateVisitInsights, getLatestVisitInsight } from "@/lib/visit-analytics/insights.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, RotateCw } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { ReasoningTooltip } from "@/components/visit-analytics/ReasoningTooltip";

export function AIInsightsPanel({ periodDays }: { periodDays: 30 | 60 | 90 }) {
  const qc = useQueryClient();
  const fetchLatest = useServerFn(getLatestVisitInsight);
  const generate = useServerFn(generateVisitInsights);
  const [expanded, setExpanded] = useState(true);

  const { data: latest, isLoading } = useQuery({
    queryKey: ["ai-visit-insight-latest"],
    queryFn: () => fetchLatest({}),
  });

  const mutate = useMutation({
    mutationFn: () => generate({ data: { periodDays } }),
    onSuccess: () => {
      toast.success("AI insights generated");
      qc.invalidateQueries({ queryKey: ["ai-visit-insight-latest"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to generate insights"),
  });

  return (
    <Card className="border-primary/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">AI Coverage Insights</h2>
          {latest?.generated_at && (
            <Badge variant="outline" className="text-[10px]">
              {format(new Date(latest.generated_at), "MMM d, p")}
            </Badge>
          )}
          {(latest as any)?.reasoning && (
            <ReasoningTooltip
              reasoning={[
                ...(((latest as any).reasoning?.triggers ?? []) as string[]),
                `Model: ${(latest as any).reasoning?.model ?? "—"}`,
                `Accounts evaluated: ${(latest as any).reasoning?.data_points_evaluated?.accounts_total ?? "—"}`,
              ]}
              label="Reasoning"
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          {latest && (
            <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Hide" : "Show"}
            </Button>
          )}
          <Button size="sm" disabled={mutate.isPending} onClick={() => mutate.mutate()}>
            {mutate.isPending ? (
              <><RotateCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />Generating…</>
            ) : latest ? (
              <><RotateCw className="mr-1.5 h-3.5 w-3.5" />Regenerate</>
            ) : (
              <><Sparkles className="mr-1.5 h-3.5 w-3.5" />Generate AI Insights</>
            )}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 text-sm">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : latest ? (
            <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:mt-4 prose-headings:mb-1.5 prose-h2:text-sm prose-h2:font-semibold prose-p:my-1.5 prose-ul:my-1.5">
              <ReactMarkdown>{latest.content}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No insights yet. Click <span className="font-medium">Generate AI Insights</span> to produce a written management summary based on the last {periodDays} days of visit coverage.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
