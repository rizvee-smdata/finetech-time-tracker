import { Lightbulb, Shield, Sparkles, TrendingUp } from "lucide-react";
import type { AIDealAnalysis } from "@/lib/deals/types";

export function AIAnalysisPanel({ analysis }: { analysis: AIDealAnalysis }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 backdrop-blur">
          <div className="mb-2 flex items-center gap-2 text-amber-400">
            <Sparkles className="h-4 w-4" />
            <h3 className="text-sm font-semibold uppercase tracking-wider">Deal Diagnosis</h3>
          </div>
          <p className="text-sm leading-relaxed text-foreground/90">{analysis.dealDiagnosis}</p>
        </div>

        <div className="rounded-lg border border-blue-500/40 bg-blue-500/5 p-4 backdrop-blur">
          <div className="mb-2 flex items-center gap-2 text-blue-400">
            <TrendingUp className="h-4 w-4" />
            <h3 className="text-sm font-semibold uppercase tracking-wider">Win Probability</h3>
          </div>
          <div className="flex items-end gap-3">
            <div className="text-4xl font-semibold tabular-nums text-blue-300">
              {analysis.winProbability}%
            </div>
            <div className="mb-1 text-xs text-muted-foreground">
              Est. close: <span className="font-medium text-foreground">{analysis.estimatedCloseDate}</span>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-300 transition-all"
              style={{ width: `${Math.max(0, Math.min(100, analysis.winProbability))}%` }}
            />
          </div>
        </div>

        <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-4 backdrop-blur">
          <div className="mb-2 flex items-center gap-2 text-red-400">
            <Shield className="h-4 w-4" />
            <h3 className="text-sm font-semibold uppercase tracking-wider">Risk Factors</h3>
          </div>
          <ul className="space-y-1.5 text-sm">
            {analysis.riskFactors.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-red-400" />
                {r}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4 backdrop-blur">
          <div className="mb-2 flex items-center gap-2 text-emerald-400">
            <Sparkles className="h-4 w-4" />
            <h3 className="text-sm font-semibold uppercase tracking-wider">Positive Signals</h3>
          </div>
          <ul className="space-y-1.5 text-sm">
            {analysis.positiveSignals.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-emerald-400" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-card/40 p-4 backdrop-blur">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Competitor Strategy
        </h3>
        <p className="text-sm leading-relaxed">{analysis.competitorStrategy}</p>
      </div>

      <div className="rounded-lg border border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-transparent p-4 backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-500/20 text-amber-400">
            <Lightbulb className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400">
              Deal Coaching Tip
            </h3>
            <p className="mt-1 text-sm leading-relaxed">{analysis.dealCoachingTip}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
