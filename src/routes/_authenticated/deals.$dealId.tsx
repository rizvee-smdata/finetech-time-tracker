import { useMemo, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { differenceInDays } from "date-fns";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDealsStore, newActionId } from "@/lib/deals/storage";
import { analyzeDeal } from "@/lib/deals/analyze.functions";
import {
  formatDealValue,
  HEALTH_COLORS,
  type NextBestAction,
} from "@/lib/deals/types";
import { HealthGauge } from "@/components/deals/HealthGauge";
import { StageStepper } from "@/components/deals/StageStepper";
import { ScoreBreakdownChart } from "@/components/deals/ScoreBreakdownChart";
import { AIAnalysisPanel } from "@/components/deals/AIAnalysisPanel";
import { NextBestActionCard } from "@/components/deals/NextBestActionCard";
import { InteractionTimeline } from "@/components/deals/InteractionTimeline";
import { AddInteractionForm } from "@/components/deals/AddInteractionForm";
import { DealIntelligence } from "@/components/deals/DealIntelligence";

export const Route = createFileRoute("/_authenticated/deals/$dealId")({
  component: DealDetailPage,
});

function DealDetailPage() {
  const { dealId } = useParams({ from: "/_authenticated/deals/$dealId" });
  const {
    deals,
    addInteraction,
    setAIAnalysis,
    toggleAction,
    updateActionDraft,
  } = useDealsStore();
  const deal = deals.find((d) => d.id === dealId);
  const [loading, setLoading] = useState(false);
  const analyze = useServerFn(analyzeDeal);

  const sparkline = useMemo(() => deal?.healthScore?.history ?? [], [deal]);

  if (!deal) {
    return (
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/deals"><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back</Link>
        </Button>
        <div className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          Deal not found.
        </div>
      </div>
    );
  }

  const status = deal.healthScore?.status ?? "at_risk";
  const score = deal.healthScore?.score ?? 0;
  const colors = HEALTH_COLORS[status];
  const daysSince = Math.max(0, differenceInDays(new Date(), new Date(deal.lastContactDate)));

  const onAnalyze = async () => {
    if (!deal.healthScore) {
      toast.error("No health score yet.");
      return;
    }
    setLoading(true);
    try {
      const res = await analyze({
        data: {
          title: deal.title,
          clientName: deal.clientName,
          clientCompany: deal.clientCompany,
          industry: deal.industry,
          dealValue: deal.dealValue,
          currency: deal.currency,
          stage: deal.stage,
          daysSinceContact: daysSince,
          healthScore: deal.healthScore.score,
          healthStatus: deal.healthScore.status,
          competitors: deal.competitors,
          products: deal.products,
          interactions: deal.interactions.slice(-5).map((i) => ({
            type: i.type,
            date: new Date(i.date).toISOString().slice(0, 10),
            notes: i.notes,
            sentiment: i.sentiment,
          })),
          breakdown: deal.healthScore.breakdown,
        },
      });
      const actions: NextBestAction[] = res.nextBestActions.map((a) => ({
        id: newActionId(),
        priority: a.priority,
        action: a.action,
        reasoning: a.reasoning,
        actionType: a.actionType,
        urgency: a.urgency,
        estimatedImpact: a.estimatedImpact,
        draftContent: a.draftContent,
        completed: false,
      }));
      setAIAnalysis(
        deal.id,
        {
          dealDiagnosis: res.dealDiagnosis,
          winProbability: res.winProbability,
          estimatedCloseDate: res.estimatedCloseDate,
          riskFactors: res.riskFactors,
          positiveSignals: res.positiveSignals,
          competitorStrategy: res.competitorStrategy,
          dealCoachingTip: res.dealCoachingTip,
          generatedAt: new Date().toISOString(),
        },
        actions,
      );
      toast.success("AI analysis complete.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm">
        <Link to="/deals"><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to Pipeline</Link>
      </Button>

      <div
        className="rounded-xl border bg-card/40 p-5 backdrop-blur"
        style={{ borderColor: `${colors.hex}55`, boxShadow: `0 0 0 1px ${colors.hex}15` }}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {deal.clientCompany} · {deal.industry}
            </div>
            <h2 className="mt-0.5 text-2xl font-semibold tracking-tight">{deal.title}</h2>
            <div className="mt-1 text-sm text-muted-foreground">
              {deal.clientName} · Owner: {deal.assignedTo}
            </div>
            <div className="mt-2 font-mono text-xl font-semibold text-emerald-300">
              {formatDealValue(deal)}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-center">
              <HealthGauge score={score} status={status} size={120} stroke={10} />
              <div className="mt-1 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
                <span>Trend: {deal.healthScore?.trend ?? "stable"}</span>
              </div>
              {sparkline.length > 1 && (
                <svg width={120} height={28} className="mx-auto mt-1">
                  {(() => {
                    const max = Math.max(...sparkline.map((p) => p.score), 1);
                    const min = Math.min(...sparkline.map((p) => p.score), 0);
                    const range = Math.max(1, max - min);
                    const pts = sparkline
                      .map((p, i) => {
                        const x = (i / (sparkline.length - 1)) * 120;
                        const y = 24 - ((p.score - min) / range) * 20;
                        return `${x},${y}`;
                      })
                      .join(" ");
                    return (
                      <polyline points={pts} fill="none" stroke={colors.hex} strokeWidth={1.5} />
                    );
                  })()}
                </svg>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <StageStepper stage={deal.stage} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={onAnalyze} disabled={loading}>
            {loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
            {deal.aiAnalysis ? "Regenerate AI Recommendations" : "Get AI Recommendations"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="analysis">
        <TabsList>
          <TabsTrigger value="analysis">AI Analysis</TabsTrigger>
          <TabsTrigger value="actions">
            Next Best Actions {deal.nextBestActions?.length ? `(${deal.nextBestActions.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="intel">Intelligence</TabsTrigger>
        </TabsList>

        <TabsContent value="analysis" className="mt-4 space-y-4">
          {deal.healthScore && (
            <div className="rounded-lg border border-border/60 bg-card/40 p-4 backdrop-blur">
              <h3 className="mb-3 text-sm font-semibold">Score Breakdown</h3>
              <ScoreBreakdownChart breakdown={deal.healthScore.breakdown} />
            </div>
          )}
          {deal.aiAnalysis ? (
            <AIAnalysisPanel analysis={deal.aiAnalysis} />
          ) : (
            <div className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
              No AI analysis yet. Click <b>Get AI Recommendations</b> above.
            </div>
          )}
        </TabsContent>

        <TabsContent value="actions" className="mt-4 space-y-3">
          {deal.nextBestActions && deal.nextBestActions.length > 0 ? (
            deal.nextBestActions.map((a) => (
              <NextBestActionCard
                key={a.id}
                action={a}
                onToggle={() => toggleAction(deal.id, a.id)}
                onUpdateDraft={(d) => updateActionDraft(deal.id, a.id, d)}
              />
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
              No actions yet. Run AI analysis to generate recommendations.
            </div>
          )}
        </TabsContent>

        <TabsContent value="timeline" className="mt-4 space-y-4">
          <AddInteractionForm onAdd={(i) => addInteraction(deal.id, i)} />
          <InteractionTimeline interactions={deal.interactions} />
        </TabsContent>

        <TabsContent value="intel" className="mt-4">
          <DealIntelligence deal={deal} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
