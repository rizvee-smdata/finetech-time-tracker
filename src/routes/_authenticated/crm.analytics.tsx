import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { fetchLeads } from "@/lib/crm/queries";
import { STAGES, ACTIVE_STAGES, LEAD_SOURCES, type CrmStage, type CrmLeadSource } from "@/lib/crm/types";

// USD formatter with K/M/B compact notation.
function formatBDT(value: number | null | undefined) {
  if (value == null || !isFinite(Number(value))) return "$0";
  const v = Number(value);
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2).replace(/\.?0+$/, "")}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1).replace(/\.?0+$/, "")}K`;
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AssigneeFilter } from "@/components/crm/AssigneeFilter";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  BarChart, PieChart, Pie, Cell,
} from "recharts";
import { format, startOfMonth, subMonths, startOfDay, startOfWeek, endOfDay, endOfWeek, subWeeks, subYears, subDays, startOfQuarter, startOfYear, differenceInDays } from "date-fns";
import { TrendingUp, TrendingDown, Download, Printer, DollarSign, Target, Trophy, Users, Clock, Sparkles, PieChart as PieIcon, Activity } from "lucide-react";

export const Route = createFileRoute("/_authenticated/crm/analytics")({
  head: () => ({
    meta: [
      { title: "CRM Analytics — Lavisho Time Tracker" },
      { name: "description", content: "Sales KPIs, pipeline funnel, revenue trends and product ranking for the Lavisho CRM." },
      { property: "og:title", content: "CRM Analytics" },
      { property: "og:description", content: "Sales analytics dashboard for the Lavisho CRM." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalyticsPage,
});

const sb = supabase as any;

type RangePreset = "this_month" | "last_month" | "this_quarter" | "ytd" | "last_12" | "custom";

function rangeFor(preset: RangePreset, customFrom?: string, customTo?: string): { from: Date; to: Date; label: string } {
  const now = new Date();
  switch (preset) {
    case "this_month": return { from: startOfMonth(now), to: now, label: "This Month" };
    case "last_month": { const lm = subMonths(startOfMonth(now), 1); return { from: lm, to: startOfMonth(now), label: "Last Month" }; }
    case "this_quarter": return { from: startOfQuarter(now), to: now, label: "This Quarter" };
    case "ytd": return { from: startOfYear(now), to: now, label: "Year to Date" };
    case "last_12": return { from: subMonths(startOfMonth(now), 11), to: now, label: "Last 12 Months" };
    case "custom": return { from: customFrom ? new Date(customFrom) : subMonths(now, 12), to: customTo ? new Date(customTo) : now, label: "Custom" };
  }
}

const GRADIENTS = [
  "from-violet-500 to-purple-600",
  "from-sky-500 to-blue-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-fuchsia-500 to-pink-600",
  "from-indigo-500 to-blue-600",
  "from-teal-500 to-cyan-600",
  "from-rose-500 to-red-600",
];

const SOURCE_COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#6b7280"];
const STAGE_COLORS: Record<CrmStage, string> = {
  new: "#64748b", initial_contact: "#3b82f6", pricing: "#06b6d4",
  negotiation: "#f59e0b", closure: "#8b5cf6", won: "#16a34a", lost: "#ef4444",
};

function AnalyticsPage() {
  const { companyId, ready } = useAuth();
  const [preset, setPreset] = useState<RangePreset>("last_12");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [owner, setOwner] = useState("all");
  const [stageFilter, setStageFilter] = useState<"all" | CrmStage>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | CrmLeadSource>("all");
  const [wlMode, setWlMode] = useState<"count" | "amount">("count");

  const range = useMemo(() => rangeFor(preset, customFrom, customTo), [preset, customFrom, customTo]);
  const prevRange = useMemo(() => {
    const days = Math.max(1, differenceInDays(range.to, range.from));
    return { from: subDays(range.from, days), to: range.from };
  }, [range]);

  const leadsQ = useQuery({
    queryKey: ["crm-analytics-leads", companyId, owner],
    enabled: ready && !!companyId,
    queryFn: () => fetchLeads({ companyId: companyId!, assignedTo: owner === "all" ? null : owner }),
  });

  const productsQ = useQuery({
    queryKey: ["crm-analytics-products", companyId],
    enabled: ready && !!companyId,
    queryFn: async () => {
      const { data } = await sb.from("crm_products").select("id, name, list_price").eq("company_id", companyId);
      return (data ?? []) as { id: string; name: string; list_price: number | null }[];
    },
  });

  const activityQ = useQuery({
    queryKey: ["crm-analytics-activity", companyId],
    enabled: ready && !!companyId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await sb.from("crm_lead_activities")
        .select("id, lead_id, activity_type, title, body, occurred_at")
        .order("occurred_at", { ascending: false }).limit(15);
      return data ?? [];
    },
  });

  const allLeads = leadsQ.data ?? [];

  const inRange = useMemo(() => allLeads.filter((l) => {
    const d = new Date(l.created_at);
    if (d < range.from || d > range.to) return false;
    if (stageFilter !== "all" && l.stage !== stageFilter) return false;
    if (sourceFilter !== "all" && l.lead_source !== sourceFilter) return false;
    return true;
  }), [allLeads, range, stageFilter, sourceFilter]);

  const prevLeads = useMemo(() => allLeads.filter((l) => {
    const d = new Date(l.created_at);
    return d >= prevRange.from && d < prevRange.to;
  }), [allLeads, prevRange]);

  // KPIs
  const won = inRange.filter((l) => l.stage === "won");
  const lost = inRange.filter((l) => l.stage === "lost");
  const open = inRange.filter((l) => ACTIVE_STAGES.includes(l.stage));
  const totalSales = won.reduce((s, l) => s + (l.expected_value ?? 0), 0);
  const pipelineValue = open.reduce((s, l) => s + (l.expected_value ?? 0), 0);
  const winRate = inRange.length ? (won.length / (won.length + lost.length || 1)) * 100 : 0;
  const avgDays = won.length
    ? Math.round(
        won.filter((l) => l.won_at).reduce((s, l) => s + differenceInDays(new Date(l.won_at!), new Date(l.created_at)), 0) /
          Math.max(1, won.filter((l) => l.won_at).length),
      )
    : 0;
  const thisMonthCreated = allLeads.filter((l) => new Date(l.created_at) >= startOfMonth(new Date())).length;
  const lastMonthCreated = allLeads.filter((l) => {
    const d = new Date(l.created_at);
    return d >= subMonths(startOfMonth(new Date()), 1) && d < startOfMonth(new Date());
  }).length;
  const qualifiedThisMonth = allLeads.filter((l) => {
    const d = new Date(l.stage_changed_at || l.created_at);
    return d >= startOfMonth(new Date()) && ["pricing", "negotiation", "closure", "won"].includes(l.stage);
  }).length;
  const activeCustomers = new Set(inRange.map((l) => l.company_name || l.customer_name)).size;

  const prevWon = prevLeads.filter((l) => l.stage === "won");
  const prevPipe = prevLeads.filter((l) => ACTIVE_STAGES.includes(l.stage)).reduce((s, l) => s + (l.expected_value ?? 0), 0);
  const prevWinRate = prevLeads.length
    ? (prevWon.length / (prevWon.length + prevLeads.filter((l) => l.stage === "lost").length || 1)) * 100
    : 0;

  const kpis = [
    { label: "Total Sales", value: formatBDT(totalSales), delta: pctChange(totalSales, prevWon.reduce((s, l) => s + (l.expected_value ?? 0), 0)), gradient: GRADIENTS[0], icon: DollarSign },
    { label: "Win Rate", value: `${winRate.toFixed(1)}%`, delta: winRate - prevWinRate, gradient: GRADIENTS[1], icon: Trophy },
    { label: "Pipeline Value", value: formatBDT(pipelineValue), delta: pctChange(pipelineValue, prevPipe), gradient: GRADIENTS[2], icon: Target },
    { label: "Open Deals", value: String(open.length), delta: null, gradient: GRADIENTS[3], icon: Activity },
    { label: "Avg Days to Close", value: `${avgDays}d`, delta: null, gradient: GRADIENTS[4], icon: Clock },
    { label: "Created This Month", value: String(thisMonthCreated), delta: pctChange(thisMonthCreated, lastMonthCreated), gradient: GRADIENTS[5], icon: Sparkles },
    { label: "Qualified This Month", value: String(qualifiedThisMonth), delta: null, gradient: GRADIENTS[6], icon: PieIcon },
    { label: "Active Customers", value: String(activeCustomers), delta: null, gradient: GRADIENTS[7], icon: Users },
  ];

  // Monthly trend (won/lost)
  const months = useMemo(() => {
    const monthsSpan = Math.max(1, Math.ceil(differenceInDays(range.to, range.from) / 30));
    const n = Math.min(24, Math.max(3, monthsSpan));
    return Array.from({ length: n }).map((_, i) => {
      const s = startOfMonth(subMonths(range.to, n - 1 - i));
      const e = startOfMonth(subMonths(range.to, n - 2 - i));
      const monthWon = inRange.filter((l) => l.stage === "won" && l.won_at && new Date(l.won_at) >= s && new Date(l.won_at) < e);
      const monthLost = inRange.filter((l) => l.stage === "lost" && l.lost_at && new Date(l.lost_at) >= s && new Date(l.lost_at) < e);
      return {
        month: format(s, "MMM"),
        won_amount: monthWon.reduce((x, l) => x + (l.expected_value ?? 0), 0),
        lost_amount: monthLost.reduce((x, l) => x + (l.expected_value ?? 0), 0),
        won_count: monthWon.length,
        lost_count: monthLost.length,
        deal_count: inRange.filter((l) => new Date(l.created_at) >= s && new Date(l.created_at) < e).length,
      };
    });
  }, [inRange, range]);

  // Today/week
  const now = new Date();
  const todayVal = won.filter((l) => l.won_at && new Date(l.won_at) >= startOfDay(now) && new Date(l.won_at) <= endOfDay(now)).reduce((s, l) => s + (l.expected_value ?? 0), 0);
  const weekVal = won.filter((l) => l.won_at && new Date(l.won_at) >= startOfWeek(now) && new Date(l.won_at) <= endOfWeek(now)).reduce((s, l) => s + (l.expected_value ?? 0), 0);
  const prevWeekVal = won.filter((l) => {
    if (!l.won_at) return false;
    const d = new Date(l.won_at);
    return d >= startOfWeek(subWeeks(now, 1)) && d <= endOfWeek(subWeeks(now, 1));
  }).reduce((s, l) => s + (l.expected_value ?? 0), 0);

  // Pipeline funnel
  const pipeline = STAGES.filter((s) => s.id !== "lost").map((s) => {
    const items = inRange.filter((l) => l.stage === s.id);
    const total = items.reduce((x, l) => x + (l.expected_value ?? 0), 0);
    return { ...s, count: items.length, total };
  });
  const pipeMax = Math.max(...pipeline.map((p) => p.count), 1);
  const convRate = inRange.length ? ((won.length / inRange.length) * 100).toFixed(1) : "0";

  // Leads by source
  const sourceCounts = LEAD_SOURCES.map((s, i) => ({
    name: s.label,
    value: inRange.filter((l) => l.lead_source === s.id).length,
    color: SOURCE_COLORS[i % SOURCE_COLORS.length],
  })).filter((s) => s.value > 0);
  const totalLeads = sourceCounts.reduce((s, x) => s + x.value, 0);

  // Product ranking
  const productSales = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of won) {
      const ids: string[] = (l as any).product_ids ?? [];
      const each = ids.length ? (l.expected_value ?? 0) / ids.length : 0;
      for (const id of ids) map.set(id, (map.get(id) ?? 0) + each);
    }
    const prods = productsQ.data ?? [];
    return prods
      .map((p) => ({ id: p.id, name: p.name, total: map.get(p.id) ?? 0 }))
      .filter((p) => p.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [won, productsQ.data]);

  // Loss reasons
  const lossReasons = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of lost) {
      const r = l.lost_reason?.trim() || "Not specified";
      map.set(r, (map.get(r) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([name, value], i) => ({ name, value, color: SOURCE_COLORS[i % SOURCE_COLORS.length] }));
  }, [lost]);

  function exportCsv() {
    const rows: string[][] = [];
    rows.push(["Lavisho Time Tracker — CRM Report"]);
    rows.push([`Range: ${range.label}`, `${format(range.from, "dd MMM yyyy")} → ${format(range.to, "dd MMM yyyy")}`]);
    rows.push([`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")} (Asia/Dhaka)`]);
    rows.push([]);
    rows.push(["KPI", "Value"]);
    for (const k of kpis) rows.push([k.label, k.value]);
    rows.push([]);
    rows.push(["Pipeline stage", "Count", "Value (BDT)"]);
    for (const p of pipeline) rows.push([p.label, String(p.count), String(p.total)]);
    rows.push([]);
    rows.push(["Month", "Won count", "Lost count", "Won amount", "Lost amount"]);
    for (const m of months) rows.push([m.month, String(m.won_count), String(m.lost_count), String(m.won_amount), String(m.lost_amount)]);
    rows.push([]);
    rows.push(["Product", "Total sales (BDT)"]);
    for (const p of productSales) rows.push([p.name, String(p.total)]);
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crm-analytics-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    // no-op; container listens for print via button
  }, []);

  const loading = leadsQ.isLoading;

  return (
    <div className="space-y-6 print:space-y-4">
      <style>{`@media print { .no-print { display: none !important; } .print\\:break-inside-avoid { break-inside: avoid; } body { background: white !important; } }`}</style>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">CRM Analytics</h1>
          <p className="text-sm text-muted-foreground">
            {range.label} · {format(range.from, "dd MMM yyyy")} → {format(range.to, "dd MMM yyyy")} · Asia/Dhaka
          </p>
        </div>
        <div className="flex gap-2 no-print">
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print / PDF</Button>
          <Button size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-1" />Export CSV</Button>
        </div>
      </header>

      {/* Filter bar */}
      <Card className="p-3 sticky top-14 z-10 backdrop-blur bg-background/95 no-print">
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_month">Last Month</SelectItem>
              <SelectItem value="this_quarter">This Quarter</SelectItem>
              <SelectItem value="ytd">Year to Date</SelectItem>
              <SelectItem value="last_12">Last 12 Months</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          {preset === "custom" && (
            <>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 px-2 rounded border bg-background text-sm" />
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 px-2 rounded border bg-background text-sm" />
            </>
          )}
          <AssigneeFilter companyId={companyId} value={owner} onChange={setOwner} className="w-44" />
          <Select value={stageFilter} onValueChange={(v) => setStageFilter(v as any)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Stage" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {STAGES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as any)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {LEAD_SOURCES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <Card key={i} className="p-5 h-28 animate-pulse bg-muted/40" />)
          : kpis.map((k) => (
              <div key={k.label} className={`rounded-2xl p-5 shadow-lg bg-gradient-to-br ${k.gradient} text-white print:break-inside-avoid`}>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-wide opacity-90">{k.label}</div>
                  <k.icon className="h-5 w-5 opacity-80" />
                </div>
                <div className="mt-2 text-2xl font-bold">{k.value}</div>
                {k.delta != null && (
                  <div className="mt-1 flex items-center gap-1 text-xs opacity-95">
                    {k.delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {Math.abs(k.delta).toFixed(1)}% vs prev
                  </div>
                )}
              </div>
            ))}
      </div>

      {/* Revenue combo + Pipeline funnel + Sources donut */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2 print:break-inside-avoid">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Revenue Analytics</h2>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={months}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis yAxisId="left" tickFormatter={(v) => formatBDT(v)} className="text-xs" />
                <YAxis yAxisId="right" orientation="right" allowDecimals={false} className="text-xs" />
                <Tooltip formatter={(v: any, name: any) => name === "Deals" ? v : formatBDT(v as number)} />
                <Legend />
                <Bar yAxisId="left" dataKey="won_amount" name="Won amount" fill="#f87171" radius={[6, 6, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="deal_count" name="Deals" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <MiniTile label="This Day" value={formatBDT(todayVal)} />
            <MiniTile label="This Week" value={formatBDT(weekVal)} delta={pctChange(weekVal, prevWeekVal)} />
            <MiniTile label="Previous Week" value={formatBDT(prevWeekVal)} />
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5 print:break-inside-avoid">
            <h2 className="mb-3 text-sm font-semibold">Sales Pipeline</h2>
            <div className="space-y-1.5">
              {pipeline.map((p, i) => {
                const w = 40 + (p.count / pipeMax) * 60;
                const pct = inRange.length ? Math.round((p.count / inRange.length) * 100) : 0;
                return (
                  <div key={p.id} className="relative" style={{ width: `${w}%`, marginLeft: `${(100 - w) / 2}%` }}>
                    <div
                      className="rounded px-3 py-2 text-xs text-white flex items-center justify-between"
                      style={{ background: `linear-gradient(90deg, hsl(${260 - i * 20}, 70%, 55%), hsl(${220 - i * 20}, 70%, 45%))` }}
                    >
                      <span className="font-medium">{p.label}</span>
                      <span className="opacity-90">{p.count} · {pct}%</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground text-right pr-1">{formatBDT(p.total)}</div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t text-xs">
              Conversion Rate: <span className="font-semibold text-emerald-600">{convRate}%</span>
            </div>
          </Card>

          <Card className="p-5 print:break-inside-avoid">
            <h2 className="mb-3 text-sm font-semibold">Leads by Source</h2>
            {sourceCounts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No leads in range.</p>
            ) : (
              <div className="h-48 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sourceCounts} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={2}>
                      {sourceCounts.map((s) => <Cell key={s.name} fill={s.color} />)}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ marginTop: -20 }}>
                  <div className="text-xl font-bold">{totalLeads}</div>
                  <div className="text-[10px] text-muted-foreground">leads</div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Won vs Lost */}
      <Card className="p-5 print:break-inside-avoid">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Deals Won vs Lost — Monthly Trend</h2>
          <div className="flex rounded border overflow-hidden text-xs">
            <button className={`px-2 py-1 ${wlMode === "count" ? "bg-primary text-primary-foreground" : "bg-background"}`} onClick={() => setWlMode("count")}>Count</button>
            <button className={`px-2 py-1 ${wlMode === "amount" ? "bg-primary text-primary-foreground" : "bg-background"}`} onClick={() => setWlMode("amount")}>Amount</button>
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={months.map((m) => ({
              month: m.month,
              Won: wlMode === "count" ? m.won_count : m.won_amount,
              Lost: -(wlMode === "count" ? m.lost_count : m.lost_amount),
            }))}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis tickFormatter={(v) => wlMode === "amount" ? formatBDT(Math.abs(v)) : String(Math.abs(v))} className="text-xs" />
              <Tooltip formatter={(v: any) => wlMode === "amount" ? formatBDT(Math.abs(v as number)) : Math.abs(v as number)} />
              <Legend />
              <Bar dataKey="Won" fill="#16a34a" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Lost" fill="#ef4444" radius={[0, 0, 4, 4]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Product ranking */}
      <Card className="p-5 print:break-inside-avoid">
        <h2 className="mb-3 text-sm font-semibold">Product / Service-wise Sales (Highest to Lowest)</h2>
        {productSales.length === 0 ? (
          <p className="text-xs text-muted-foreground">No product-tagged won deals in range.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              {productSales.map((p, i) => (
                <div key={p.id} className="flex items-center justify-between text-sm border-b py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground w-5">#{i + 1}</span>
                    <span className="truncate max-w-[180px]">{p.name}</span>
                  </div>
                  <span className="font-medium">{formatBDT(p.total)}</span>
                </div>
              ))}
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productSales} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tickFormatter={(v) => formatBDT(v)} className="text-xs" />
                  <YAxis type="category" dataKey="name" width={100} className="text-xs" />
                  <Tooltip formatter={(v: any) => formatBDT(v as number)} />
                  <Bar dataKey="total" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </Card>

      {/* Loss reasons + Activity timeline */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5 print:break-inside-avoid">
          <h2 className="mb-3 text-sm font-semibold">Deal Loss Reasons</h2>
          {lossReasons.length === 0 ? (
            <p className="text-xs text-muted-foreground">No lost deals in the selected range. </p>
          ) : (
            <div className="h-56 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={lossReasons} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {lossReasons.map((r) => <Cell key={r.name} fill={r.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ marginTop: -20 }}>
                <div className="text-xl font-bold">{lost.length}</div>
                <div className="text-[10px] text-muted-foreground">lost</div>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-5 print:break-inside-avoid">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent Activity</h2>
            <Badge variant="secondary" className="text-[10px]">auto-refresh</Badge>
          </div>
          {(activityQ.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No recent activity.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-auto">
              {(activityQ.data ?? []).map((a: any) => (
                <div key={a.id} className="flex gap-3 text-xs border-l-2 pl-3 py-1" style={{ borderColor: activityColor(a.activity_type) }}>
                  <div className="text-muted-foreground w-12 shrink-0">{format(new Date(a.occurred_at), "HH:mm")}</div>
                  <div>
                    <div className="font-medium">{a.title || a.activity_type}</div>
                    {a.body && <div className="text-muted-foreground line-clamp-2">{a.body}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function MiniTile({ label, value, delta }: { label: string; value: string; delta?: number | null }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {delta != null && (
        <div className={`mt-0.5 text-[10px] inline-flex items-center gap-0.5 ${delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
          {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {Math.abs(delta).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

function pctChange(now: number, prev: number): number {
  if (!prev) return now ? 100 : 0;
  return ((now - prev) / prev) * 100;
}

function activityColor(t: string) {
  switch (t) {
    case "stage_changed": return "#8b5cf6";
    case "note": return "#3b82f6";
    case "call": return "#10b981";
    case "email": return "#f59e0b";
    case "meeting": return "#ec4899";
    default: return "#64748b";
  }
}
