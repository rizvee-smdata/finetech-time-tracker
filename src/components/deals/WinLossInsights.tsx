import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { differenceInDays, format } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDealsStore } from "@/lib/deals/storage";
import { generateWinLossReport } from "@/lib/deals/winloss.functions";

const PIE_COLORS = ["#EF4444", "#F59E0B", "#3B82F6", "#A78BFA", "#10B981"];

export function WinLossInsights() {
  const { deals } = useDealsStore();
  const closed = deals.filter((d) => d.stage === "Closed Won" || d.stage === "Closed Lost");
  const won = closed.filter((d) => d.stage === "Closed Won");
  const lost = closed.filter((d) => d.stage === "Closed Lost");

  const winRate = closed.length > 0 ? Math.round((won.length / closed.length) * 100) : 0;
  const avgCycle =
    won.length > 0
      ? Math.round(
          won.reduce(
            (s, d) =>
              s + Math.max(0, differenceInDays(new Date(d.expectedCloseDate), new Date(d.createdAt))),
            0,
          ) / won.length,
        )
      : 0;
  const avgWonValue =
    won.length > 0 ? Math.round(won.reduce((s, d) => s + d.dealValue, 0) / won.length) : 0;
  const topLossReason =
    Object.entries(
      lost.reduce<Record<string, number>>((m, d) => {
        const k = d.lossReason ?? "Unknown";
        m[k] = (m[k] ?? 0) + 1;
        return m;
      }, {}),
    ).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  const byIndustry = useMemo(() => {
    const m = new Map<string, { won: number; total: number }>();
    closed.forEach((d) => {
      const cur = m.get(d.industry) ?? { won: 0, total: 0 };
      cur.total += 1;
      if (d.stage === "Closed Won") cur.won += 1;
      m.set(d.industry, cur);
    });
    return Array.from(m.entries()).map(([industry, v]) => ({
      industry,
      winRate: Math.round((v.won / v.total) * 100),
    }));
  }, [closed]);

  const byProduct = useMemo(() => {
    const m = new Map<string, { won: number; total: number }>();
    closed.forEach((d) => {
      d.products.forEach((p) => {
        const cur = m.get(p) ?? { won: 0, total: 0 };
        cur.total += 1;
        if (d.stage === "Closed Won") cur.won += 1;
        m.set(p, cur);
      });
    });
    return Array.from(m.entries()).map(([product, v]) => ({
      product,
      winRate: Math.round((v.won / v.total) * 100),
    }));
  }, [closed]);

  const cycleTrend = useMemo(() => {
    return won
      .map((d) => ({
        month: format(new Date(d.expectedCloseDate), "MMM yy"),
        days: Math.max(0, differenceInDays(new Date(d.expectedCloseDate), new Date(d.createdAt))),
      }))
      .slice(-12);
  }, [won]);

  const lossReasons = useMemo(() => {
    const m = new Map<string, number>();
    lost.forEach((d) => {
      const k = d.lossReason ?? "Unknown";
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [lost]);

  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const generate = useServerFn(generateWinLossReport);

  const onGenerate = async () => {
    if (closed.length === 0) {
      toast.error("No closed deals to analyze yet.");
      return;
    }
    setLoading(true);
    try {
      const res = await generate({
        data: {
          deals: closed.map((d) => ({
            title: d.title,
            clientCompany: d.clientCompany,
            industry: d.industry,
            dealValue: d.dealValue,
            currency: d.currency,
            stage: d.stage as "Closed Won" | "Closed Lost",
            products: d.products,
            competitors: d.competitors,
            cycleDays: Math.max(
              0,
              differenceInDays(new Date(d.expectedCloseDate), new Date(d.createdAt)),
            ),
            lossReason: d.lossReason,
          })),
        },
      });
      setReport(res.report);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate report.");
    } finally {
      setLoading(false);
    }
  };

  const stat = (label: string, value: string, accent = "text-foreground") => (
    <div className="rounded-lg border border-border/60 bg-card/40 p-4 backdrop-blur">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${accent}`}>{value}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stat("Win Rate", `${winRate}%`, "text-emerald-400")}
        {stat("Avg Cycle (days)", `${avgCycle}`, "text-blue-400")}
        {stat("Avg Won Value", avgWonValue.toLocaleString(), "text-amber-400")}
        {stat("Top Loss Reason", topLossReason, "text-red-400")}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border/60 bg-card/40 p-4 backdrop-blur">
          <h3 className="mb-2 text-sm font-semibold">Win Rate by Industry</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byIndustry}>
                <CartesianGrid stroke="#222" strokeDasharray="3 3" />
                <XAxis dataKey="industry" tick={{ fontSize: 10, fill: "#888" }} />
                <YAxis tick={{ fontSize: 10, fill: "#888" }} />
                <Tooltip contentStyle={{ backgroundColor: "#0D1117", border: "1px solid #333" }} />
                <Bar dataKey="winRate" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-card/40 p-4 backdrop-blur">
          <h3 className="mb-2 text-sm font-semibold">Win Rate by Product</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byProduct}>
                <CartesianGrid stroke="#222" strokeDasharray="3 3" />
                <XAxis dataKey="product" tick={{ fontSize: 10, fill: "#888" }} />
                <YAxis tick={{ fontSize: 10, fill: "#888" }} />
                <Tooltip contentStyle={{ backgroundColor: "#0D1117", border: "1px solid #333" }} />
                <Bar dataKey="winRate" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-card/40 p-4 backdrop-blur">
          <h3 className="mb-2 text-sm font-semibold">Deal Cycle Trend</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cycleTrend}>
                <CartesianGrid stroke="#222" strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#888" }} />
                <YAxis tick={{ fontSize: 10, fill: "#888" }} />
                <Tooltip contentStyle={{ backgroundColor: "#0D1117", border: "1px solid #333" }} />
                <Line type="monotone" dataKey="days" stroke="#A78BFA" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-card/40 p-4 backdrop-blur">
          <h3 className="mb-2 text-sm font-semibold">Loss Reasons</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={lossReasons.length > 0 ? lossReasons : [{ name: "No losses", value: 1 }]}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={70}
                  label
                >
                  {(lossReasons.length > 0 ? lossReasons : [{ name: "No losses", value: 1 }]).map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "#0D1117", border: "1px solid #333" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-amber-300">AI Pattern Summary</h3>
          <Button onClick={onGenerate} disabled={loading} variant="outline" size="sm">
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            {loading ? "Generating..." : "✨ Generate Win/Loss Intelligence Report"}
          </Button>
        </div>
        {report ? (
          <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed">{report}</pre>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Generate an AI-powered report summarizing patterns, focus areas, and competitor performance.
          </p>
        )}
      </div>
    </div>
  );
}
