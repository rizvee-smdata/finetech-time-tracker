import type { ScoreBreakdown } from "@/lib/deals/types";

const ROWS: Array<{ key: keyof ScoreBreakdown; label: string; color: string }> = [
  { key: "recencyScore", label: "Recency", color: "#3B82F6" },
  { key: "engagementScore", label: "Engagement", color: "#10B981" },
  { key: "momentumScore", label: "Momentum", color: "#F59E0B" },
  { key: "sentimentScore", label: "Sentiment", color: "#A78BFA" },
];

export function ScoreBreakdownChart({ breakdown }: { breakdown: ScoreBreakdown }) {
  return (
    <div className="space-y-2.5">
      {ROWS.map((r) => {
        const v = breakdown[r.key];
        const pct = (v / 25) * 100;
        return (
          <div key={r.key}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{r.label}</span>
              <span className="font-mono font-medium">{v}/25</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, backgroundColor: r.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
