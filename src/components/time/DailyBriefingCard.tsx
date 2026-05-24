import { useEffect, useState } from "react";
import { Sparkles, RefreshCw, Target, AlertTriangle, Zap, ShieldAlert, TrendingUp } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generateBriefing } from "@/lib/time/briefing.functions";
import { BRIEFING_KEY } from "@/lib/time/storage";
import type { TimeEntry } from "@/lib/time/types";
import type { Deal } from "@/lib/deals/types";

type Point = { icon: string; title: string; detail: string };

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  focus: Target, overdue: AlertTriangle, quick_win: Zap, risk: ShieldAlert, motivation: TrendingUp,
};

export function DailyBriefingCard({ entries, deals }: { entries: TimeEntry[]; deals: Deal[] }) {
  const gen = useServerFn(generateBriefing);
  const [loading, setLoading] = useState(false);
  const [points, setPoints] = useState<Point[] | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(BRIEFING_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { date: string; points: Point[] };
        if (parsed.date === new Date().toDateString()) setPoints(parsed.points);
      }
    } catch {}
  }, []);

  async function run() {
    setLoading(true);
    try {
      const yesterday = Date.now() - 86400000;
      const yEntries = entries.filter((e) => new Date(e.startTime).getTime() >= yesterday);
      const ctx = `Today: ${new Date().toDateString()}

Active deals:
${deals.filter((d) => d.stage !== "Closed Won" && d.stage !== "Closed Lost").map((d) =>
  `- ${d.clientCompany} (${d.title}) | stage ${d.stage} | health ${d.healthScore?.score ?? "?"} | close ${new Date(d.expectedCloseDate).toDateString()}`,
).join("\n")}

Pending next-best-actions due today:
${deals.flatMap((d) => (d.nextBestActions ?? []).filter((a) => !a.completed && a.urgency === "today").map((a) =>
  `- [${d.clientCompany}] ${a.action}`,
)).join("\n") || "  (none)"}

Yesterday's time: ${yEntries.reduce((s, e) => s + e.duration / 60, 0).toFixed(1)} hrs across ${yEntries.length} entries.`;
      const result = await gen({ data: { context: ctx } });
      setPoints(result.points);
      localStorage.setItem(BRIEFING_KEY, JSON.stringify({ date: new Date().toDateString(), points: result.points }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate briefing");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-semibold">Today's focus</h3>
        </div>
        <Button size="sm" variant="ghost" onClick={run} disabled={loading} className="h-7">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {!points && !loading && (
        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground mb-3">Generate your AI daily briefing.</p>
          <Button size="sm" onClick={run} className="bg-amber-500 hover:bg-amber-400 text-black">Generate briefing</Button>
        </div>
      )}
      {points && (
        <ol className="space-y-2">
          {points.map((p, i) => {
            const Icon = ICONS[p.icon] ?? Target;
            return (
              <li key={i} className="flex gap-2">
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-400 text-xs font-bold">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-medium"><Icon className="h-3.5 w-3.5 text-amber-400" />{p.title}</div>
                  <div className="text-xs text-muted-foreground">{p.detail}</div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
