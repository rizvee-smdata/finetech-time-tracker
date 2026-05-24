import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { differenceInCalendarDays, format, subMonths } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { useProposalsStore } from "@/lib/proposals/storage";
import { fmtMoney, grandTotal } from "@/lib/proposals/utils";
import { TEMPLATE_META } from "@/lib/proposals/templates";
import { analyzeProposalWins } from "@/lib/proposals/insights.functions";

export const Route = createFileRoute("/_authenticated/proposals/analytics")({
  component: ProposalAnalyticsPage,
});

const COLORS = ["#10B981", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6"];

function ProposalAnalyticsPage() {
  const { proposals } = useProposalsStore();
  const analyze = useServerFn(analyzeProposalWins);
  const [insight, setInsight] = useState<Awaited<ReturnType<typeof analyze>> | null>(null);
  const [busy, setBusy] = useState(false);

  const sent = proposals.filter((p) => ["sent", "accepted", "rejected"].includes(p.status));
  const accepted = proposals.filter((p) => p.status === "accepted");
  const winRate = sent.length ? Math.round((accepted.length / sent.length) * 100) : 0;
  const avgValue = proposals.length
    ? proposals.reduce((s, p) => s + grandTotal(p.proposedProducts), 0) / proposals.length
    : 0;
  const fastestClose = (() => {
    const days = accepted
      .map((p) => (p.sentAt && p.decidedAt ? differenceInCalendarDays(new Date(p.decidedAt), new Date(p.sentAt)) : null))
      .filter((x): x is number => x !== null);
    return days.length ? Math.min(...days) : null;
  })();

  const byTemplate = useMemo(() => {
    const map = new Map<string, { wins: number; sent: number }>();
    for (const p of proposals) {
      const k = p.template;
      const o = map.get(k) ?? { wins: 0, sent: 0 };
      if (["sent", "accepted", "rejected"].includes(p.status)) o.sent += 1;
      if (p.status === "accepted") o.wins += 1;
      map.set(k, o);
    }
    return Array.from(map.entries()).map(([k, v]) => ({
      template: TEMPLATE_META[k as keyof typeof TEMPLATE_META]?.label ?? k,
      rate: v.sent ? Math.round((v.wins / v.sent) * 100) : 0,
    }));
  }, [proposals]);

  const topTemplate = byTemplate.slice().sort((a, b) => b.rate - a.rate)[0]?.template ?? "—";

  const byIndustry = useMemo(() => {
    const map = new Map<string, { wins: number; sent: number }>();
    for (const p of proposals) {
      const k = p.clientIndustry || "Other";
      const o = map.get(k) ?? { wins: 0, sent: 0 };
      if (["sent", "accepted", "rejected"].includes(p.status)) o.sent += 1;
      if (p.status === "accepted") o.wins += 1;
      map.set(k, o);
    }
    return Array.from(map.entries()).map(([k, v]) => ({
      industry: k,
      rate: v.sent ? Math.round((v.wins / v.sent) * 100) : 0,
    }));
  }, [proposals]);

  const trend = useMemo(() => {
    const months: { month: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      months.push({ month: format(d, "MMM"), count: 0 });
    }
    for (const p of proposals) {
      const d = new Date(p.createdAt);
      const label = format(d, "MMM");
      const m = months.find((x) => x.month === label);
      if (m) m.count += 1;
    }
    return months;
  }, [proposals]);

  const statusBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of proposals) counts[p.status] = (counts[p.status] ?? 0) + 1;
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [proposals]);

  async function runInsight() {
    setBusy(true);
    try {
      const res = await analyze({
        data: {
          outcomes: proposals.map((p) => {
            const exec = p.sections.find((s) => s.type === "executive_summary");
            const execWords = exec ? exec.content.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length : 0;
            const days = p.sentAt && p.decidedAt ? differenceInCalendarDays(new Date(p.decidedAt), new Date(p.sentAt)) : null;
            return {
              title: p.title,
              industry: p.clientIndustry,
              template: p.template,
              status: p.status,
              value: grandTotal(p.proposedProducts),
              daysSentToDecision: days,
              executiveSummaryWordCount: execWords,
              sectionCount: p.sections.length,
            };
          }),
        },
      });
      setInsight(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPI label="Win Rate" value={`${winRate}%`} accent />
        <KPI label="Avg Proposal Value" value={fmtMoney(avgValue, "BDT")} />
        <KPI label="Fastest Close" value={fastestClose !== null ? `${fastestClose} days` : "—"} />
        <KPI label="Top Template" value={topTemplate} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Win rate by industry">
          <BarChart data={byIndustry}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="industry" stroke="#94a3b8" fontSize={11} />
            <YAxis stroke="#94a3b8" fontSize={11} />
            <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid #334155" }} />
            <Bar dataKey="rate" fill="#10B981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Win rate by template">
          <BarChart data={byTemplate}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="template" stroke="#94a3b8" fontSize={11} />
            <YAxis stroke="#94a3b8" fontSize={11} />
            <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid #334155" }} />
            <Bar dataKey="rate" fill="#3B82F6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Proposals per month">
          <LineChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
            <YAxis stroke="#94a3b8" fontSize={11} />
            <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid #334155" }} />
            <Line type="monotone" dataKey="count" stroke="#10B981" strokeWidth={2} dot={{ fill: "#10B981" }} />
          </LineChart>
        </ChartCard>

        <ChartCard title="Status breakdown">
          <PieChart>
            <Pie data={statusBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
              {statusBreakdown.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Legend />
            <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid #334155" }} />
          </PieChart>
        </ChartCard>
      </div>

      <Card className="border-border/60 bg-card/40 backdrop-blur">
        <CardContent className="space-y-3 p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">AI Win Pattern Analysis</div>
              <div className="text-xs text-muted-foreground">
                Surface specific traits that separate winning proposals from the rest.
              </div>
            </div>
            <Button className="bg-emerald-500 hover:bg-emerald-600" onClick={runInsight} disabled={busy}>
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />} Analyze
            </Button>
          </div>
          {insight && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 md:col-span-2">
                <div className="text-xs uppercase text-emerald-400">Headline</div>
                <div className="text-sm">{insight.headline}</div>
              </div>
              <Insight title="Winning traits" items={insight.winningTraits} accent="emerald" />
              <Insight title="Losing traits" items={insight.losingTraits} accent="red" />
              <Insight title="Actionable insights" items={insight.actionableInsights} accent="blue" className="md:col-span-2" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KPI({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className="border-border/60 bg-card/40 backdrop-blur">
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1 text-xl font-bold ${accent ? "text-emerald-400" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <Card className="border-border/60 bg-card/40 backdrop-blur">
      <CardContent className="space-y-2 p-4">
        <div className="text-sm font-semibold">{title}</div>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function Insight({
  title,
  items,
  accent,
  className,
}: {
  title: string;
  items: string[];
  accent: "emerald" | "red" | "blue";
  className?: string;
}) {
  const color = accent === "emerald" ? "text-emerald-400" : accent === "red" ? "text-red-400" : "text-blue-400";
  return (
    <div className={`rounded-md border border-border/60 bg-card/40 p-3 ${className ?? ""}`}>
      <div className={`text-xs uppercase ${color}`}>{title}</div>
      <ul className="mt-1 space-y-1 text-sm">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2"><span className={color}>•</span><span>{it}</span></li>
        ))}
      </ul>
    </div>
  );
}
