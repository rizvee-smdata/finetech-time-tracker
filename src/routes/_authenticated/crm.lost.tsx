import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/crm/types";
import { format, parseISO, subDays } from "date-fns";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/crm/lost")({
  component: LostAnalysisPage,
});

type LostLead = {
  id: string;
  customer_name: string;
  company_name: string | null;
  lost_reason: string | null;
  competitor_name: string | null;
  competitor_price: number | null;
  expected_value: number | null;
  currency: string;
  lost_at: string | null;
  assigned_to: string | null;
  lead_source: string;
};

const REASON_COLORS = ["#ef4444", "#f59e0b", "#3b82f6", "#8b5cf6", "#10b981", "#ec4899", "#06b6d4", "#64748b"];

function bucketReason(raw: string | null): string {
  if (!raw) return "Unspecified";
  const r = raw.toLowerCase();
  if (r.includes("price") || r.includes("cost") || r.includes("expensive") || r.includes("budget")) return "Price";
  if (r.includes("competitor") || r.includes("competition")) return "Lost to competitor";
  if (r.includes("timing") || r.includes("time")) return "Bad timing";
  if (r.includes("feature") || r.includes("missing") || r.includes("functionality")) return "Missing features";
  if (r.includes("no response") || r.includes("ghost") || r.includes("silent")) return "No response";
  if (r.includes("decision") || r.includes("internal")) return "Internal decision";
  if (r.includes("not interested") || r.includes("no need")) return "Not interested";
  return "Other";
}

function LostAnalysisPage() {
  const { companyId, ready } = useAuth();
  const [days, setDays] = useState<string>("90");
  const [search, setSearch] = useState("");

  const lost = useQuery({
    queryKey: ["crm-lost", companyId, days],
    enabled: ready && !!companyId,
    queryFn: async () => {
      const since = subDays(new Date(), parseInt(days, 10)).toISOString();
      const { data, error } = await sb
        .from("crm_leads")
        .select("id, customer_name, company_name, lost_reason, competitor_name, competitor_price, expected_value, currency, lost_at, assigned_to, lead_source")
        .eq("company_id", companyId)
        .eq("stage", "lost")
        .gte("lost_at", since)
        .order("lost_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LostLead[];
    },
  });

  const rows = lost.data ?? [];

  const reasonBuckets = useMemo(() => {
    const map = new Map<string, { count: number; value: number }>();
    for (const l of rows) {
      const b = bucketReason(l.lost_reason);
      const cur = map.get(b) ?? { count: 0, value: 0 };
      cur.count++;
      cur.value += l.expected_value ?? 0;
      map.set(b, cur);
    }
    return Array.from(map.entries())
      .map(([reason, v]) => ({ reason, count: v.count, value: v.value }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const competitorBuckets = useMemo(() => {
    const map = new Map<string, { count: number; value: number }>();
    for (const l of rows) {
      if (!l.competitor_name) continue;
      const cur = map.get(l.competitor_name) ?? { count: 0, value: 0 };
      cur.count++;
      cur.value += l.expected_value ?? 0;
      map.set(l.competitor_name, cur);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, count: v.count, value: v.value }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [rows]);

  const totalLost = rows.length;
  const totalValue = rows.reduce((s, l) => s + (l.expected_value ?? 0), 0);

  const filtered = rows.filter((l) =>
    !search ||
    l.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    (l.company_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (l.lost_reason ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (l.competitor_name ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Lost-deal analysis</h2>
          <p className="text-sm text-muted-foreground">Why deals slip away — by reason, competitor, and value at risk.</p>
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="180">Last 180 days</SelectItem>
            <SelectItem value="365">Last 365 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Deals lost</div>
          <div className="text-2xl font-semibold">{totalLost}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Value lost</div>
          <div className="text-2xl font-semibold text-red-600">{formatMoney(totalValue)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Top reason</div>
          <div className="text-2xl font-semibold">{reasonBuckets[0]?.reason ?? "—"}</div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h3 className="font-semibold mb-3">By reason</h3>
          {reasonBuckets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lost deals in this range.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={reasonBuckets} layout="vertical" margin={{ left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" />
                <YAxis dataKey="reason" type="category" width={130} className="text-xs" />
                <Tooltip />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {reasonBuckets.map((_, i) => (
                    <Cell key={i} fill={REASON_COLORS[i % REASON_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold mb-3">Top competitors</h3>
          {competitorBuckets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No competitor data logged.</p>
          ) : (
            <div className="divide-y">
              {competitorBuckets.map((c) => (
                <div key={c.name} className="py-2 flex items-center justify-between gap-2">
                  <span className="font-medium">{c.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{c.count} deal{c.count > 1 ? "s" : ""}</Badge>
                    <span className="text-sm text-muted-foreground">{formatMoney(c.value)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-semibold">Lost deals ({filtered.length})</h3>
          <Input
            placeholder="Search by customer, reason, competitor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No matching deals.</p>
        ) : (
          <div className="divide-y">
            {filtered.map((l) => (
              <div key={l.id} className="py-3 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <Link to="/crm/$leadId" params={{ leadId: l.id }} className="font-medium hover:underline">
                    {l.customer_name}
                  </Link>
                  {l.company_name && <span className="text-sm text-muted-foreground"> · {l.company_name}</span>}
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {l.lost_reason ?? "No reason given"}
                  </div>
                </div>
                {l.competitor_name && (
                  <Badge variant="outline">vs {l.competitor_name}{l.competitor_price ? ` @ ${formatMoney(l.competitor_price, l.currency)}` : ""}</Badge>
                )}
                <span className="text-sm">{formatMoney(l.expected_value, l.currency)}</span>
                {l.lost_at && (
                  <span className="text-xs text-muted-foreground">{format(parseISO(l.lost_at), "MMM d, yyyy")}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
