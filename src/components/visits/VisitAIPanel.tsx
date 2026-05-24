import { useState } from "react";
import { Sparkles, Copy, Mail, AlertTriangle, ArrowRight, ListChecks, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { analyzeVisit, type VisitAnalysis } from "@/lib/visits/analyze.functions";

type Props = { visit: any };

const SENTIMENT_CLS: Record<string, string> = {
  positive: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  neutral: "bg-muted text-muted-foreground border-border",
  negative: "bg-red-500/15 text-red-300 border-red-500/40",
};

export function VisitAIPanel({ visit }: Props) {
  const qc = useQueryClient();
  const run = useServerFn(analyzeVisit);
  const [busy, setBusy] = useState(false);

  const hasAnalysis = !!visit.ai_summary;
  const analysis: Partial<VisitAnalysis> = {
    summary: visit.ai_summary ?? undefined,
    sentiment: (visit.ai_sentiment ?? undefined) as VisitAnalysis["sentiment"] | undefined,
    painPoints: (visit.ai_pain_points ?? []) as string[],
    nextSteps: (visit.ai_next_steps ?? []) as string[],
    actionItems: (visit.ai_action_items ?? []) as VisitAnalysis["actionItems"],
    followUpSubject: visit.ai_follow_up_subject ?? undefined,
    followUpEmail: visit.ai_follow_up_email ?? undefined,
  };

  async function analyze() {
    if (!visit.discussion_summary || !visit.discussion_summary.trim()) {
      toast.error("Add a discussion summary first — the AI needs notes to analyze.");
      return;
    }
    setBusy(true);
    try {
      const result = await run({
        data: {
          customerName: visit.customer_name,
          company: visit.company,
          location: visit.location,
          meetingAt: visit.meeting_at,
          discussionSummary: visit.discussion_summary,
          nextAction: visit.next_action,
          remarks: visit.remarks,
        },
      });
      const { error } = await supabase
        .from("customer_visits")
        .update({
          ai_summary: result.summary,
          ai_sentiment: result.sentiment,
          ai_pain_points: result.painPoints,
          ai_next_steps: result.nextSteps,
          ai_action_items: result.actionItems,
          ai_follow_up_subject: result.followUpSubject,
          ai_follow_up_email: result.followUpEmail,
          ai_analyzed_at: new Date().toISOString(),
        })
        .eq("id", visit.id);
      if (error) throw error;
      toast.success("AI analysis ready");
      qc.invalidateQueries({ queryKey: ["visits"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Analysis failed");
    } finally {
      setBusy(false);
    }
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copied`),
      () => toast.error("Copy failed"),
    );
  }

  function mailto() {
    if (!analysis.followUpEmail) return;
    const to = visit.email ? `?to=${encodeURIComponent(visit.email)}` : "";
    const subject = analysis.followUpSubject
      ? `${to ? "&" : "?"}subject=${encodeURIComponent(analysis.followUpSubject)}`
      : "";
    const body = `${to || subject ? "&" : "?"}body=${encodeURIComponent(analysis.followUpEmail)}`;
    window.open(`mailto:${visit.email ?? ""}${to}${subject}${body}`, "_blank");
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" /> AI analysis
          {hasAnalysis && analysis.sentiment && (
            <Badge variant="outline" className={SENTIMENT_CLS[analysis.sentiment]}>
              {analysis.sentiment}
            </Badge>
          )}
        </div>
        <Button size="sm" onClick={analyze} disabled={busy}>
          {busy ? (
            <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Analyzing…</>
          ) : hasAnalysis ? (
            <><Sparkles className="mr-1 h-3 w-3" />Re-analyze</>
          ) : (
            <><Sparkles className="mr-1 h-3 w-3" />Analyze with AI</>
          )}
        </Button>
      </div>

      {!hasAnalysis && !busy && (
        <p className="mt-2 text-xs text-muted-foreground">
          Turn the discussion notes into a summary, sentiment, action items and a follow-up email.
        </p>
      )}

      {hasAnalysis && (
        <div className="mt-4 space-y-4 text-sm">
          {analysis.summary && (
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Summary</div>
              <p className="whitespace-pre-wrap">{analysis.summary}</p>
            </div>
          )}

          {(analysis.painPoints?.length ?? 0) > 0 && (
            <div>
              <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <AlertTriangle className="h-3 w-3" /> Pain points
              </div>
              <ul className="list-disc space-y-0.5 pl-5">
                {analysis.painPoints!.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          )}

          {(analysis.nextSteps?.length ?? 0) > 0 && (
            <div>
              <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <ArrowRight className="h-3 w-3" /> Next steps
              </div>
              <ul className="list-disc space-y-0.5 pl-5">
                {analysis.nextSteps!.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          )}

          {(analysis.actionItems?.length ?? 0) > 0 && (
            <div>
              <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <ListChecks className="h-3 w-3" /> Action items
              </div>
              <div className="space-y-2">
                {analysis.actionItems!.map((a, i) => (
                  <div key={i} className="rounded-md border border-border/60 bg-background/40 p-2 text-xs">
                    <div className="font-medium">{a.task}</div>
                    <div className="text-muted-foreground">
                      {a.owner} · due {a.deadline} ·
                      <span className={
                        a.priority === "high" ? " text-red-300" :
                        a.priority === "medium" ? " text-amber-300" : " text-muted-foreground"
                      }> {a.priority}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {analysis.followUpEmail && (
            <>
              <Separator />
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Follow-up email draft
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => copy(analysis.followUpEmail!, "Email")}>
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={mailto}>
                      <Mail className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {analysis.followUpSubject && (
                  <div className="mb-1 text-xs"><span className="text-muted-foreground">Subject:</span> {analysis.followUpSubject}</div>
                )}
                <pre className="whitespace-pre-wrap rounded-md border border-border/60 bg-background/40 p-3 font-sans text-xs">{analysis.followUpEmail}</pre>
              </div>
            </>
          )}

          {visit.ai_analyzed_at && (
            <div className="text-[11px] text-muted-foreground">
              Analyzed {new Date(visit.ai_analyzed_at).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
