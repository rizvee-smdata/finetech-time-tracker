import { useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generateWeeklyInsight } from "@/lib/time/insight.functions";
import type { TimeEntry } from "@/lib/time/types";
import type { Deal } from "@/lib/deals/types";

export function WeeklyInsightCard({ entries, deals }: { entries: TimeEntry[]; deals: Deal[] }) {
  const gen = useServerFn(generateWeeklyInsight);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    try {
      const sevenDaysAgo = Date.now() - 7 * 86400000;
      const recent = entries.filter((e) => new Date(e.startTime).getTime() >= sevenDaysAgo);
      const byCat = new Map<string, number>();
      for (const e of recent) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.duration / 60);
      const byClient = new Map<string, number>();
      for (const e of recent) if (e.clientCompany) byClient.set(e.clientCompany, (byClient.get(e.clientCompany) ?? 0) + e.duration / 60);
      const ctx = `Last 7 days time summary:
- Total hours: ${(recent.reduce((s, e) => s + e.duration / 60, 0)).toFixed(1)}
- Billable: ${(recent.filter((e) => e.billable).reduce((s, e) => s + e.duration / 60, 0)).toFixed(1)}

By category:
${[...byCat.entries()].map(([c, h]) => `  ${c}: ${h.toFixed(1)}h`).join("\n")}

By client:
${[...byClient.entries()].map(([c, h]) => `  ${c}: ${h.toFixed(1)}h`).join("\n")}

Active deals:
${deals.filter((d) => d.stage !== "Closed Won" && d.stage !== "Closed Lost").map((d) =>
  `  ${d.clientCompany} — ${d.title} | value ${d.currency} ${d.dealValue} | stage ${d.stage} | health ${d.healthScore?.score ?? "?"}`,
).join("\n")}`;
      const result = await gen({ data: { context: ctx } });
      setText(result.text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate insight");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-semibold">Weekly time intelligence</h3>
        </div>
        <Button size="sm" onClick={run} disabled={loading} className="bg-amber-500 hover:bg-amber-400 text-black">
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : (text ? "Regenerate" : "Generate")}
        </Button>
      </div>
      {!text && !loading && (
        <p className="text-sm text-muted-foreground">Get an AI-generated 4-5 paragraph report on time vs revenue patterns and one specific recommendation.</p>
      )}
      {text && (
        <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap">
          {text}
        </div>
      )}
    </div>
  );
}
