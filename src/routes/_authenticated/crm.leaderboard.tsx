import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchCompanyMembers } from "@/lib/crm/queries";
import { formatBDT } from "@/lib/crm/types";
import { startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, format } from "date-fns";
import { Trophy, Medal, Award, Phone, Mail, MessageSquare, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/crm/leaderboard")({
  component: LeaderboardPage,
});

type Period = "month" | "quarter" | "year";
type Metric = "revenue" | "deals" | "activities" | "calls";

function LeaderboardPage() {
  const { companyId, user } = useAuth();
  const currentUserId = user?.id ?? null;
  const [period, setPeriod] = useState<Period>("month");
  const [metric, setMetric] = useState<Metric>("revenue");

  const range = useMemo(() => {
    const now = new Date();
    if (period === "month") return { start: startOfMonth(now), end: endOfMonth(now), label: format(now, "MMMM yyyy") };
    if (period === "quarter") return { start: startOfQuarter(now), end: endOfQuarter(now), label: `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}` };
    return { start: startOfYear(now), end: endOfYear(now), label: String(now.getFullYear()) };
  }, [period]);

  const members = useQuery({
    queryKey: ["company-members", companyId],
    enabled: !!companyId,
    queryFn: () => fetchCompanyMembers(companyId!),
  });

  const wonLeads = useQuery({
    queryKey: ["lb-won", companyId, period],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("crm_leads")
        .select("assigned_to, expected_value, currency, won_at")
        .eq("company_id", companyId)
        .eq("stage", "won")
        .gte("won_at", range.start.toISOString())
        .lte("won_at", range.end.toISOString());
      if (error) throw error;
      return (data ?? []) as { assigned_to: string | null; expected_value: number | null }[];
    },
  });

  const lostLeads = useQuery({
    queryKey: ["lb-lost", companyId, period],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("crm_leads")
        .select("assigned_to, lost_at")
        .eq("company_id", companyId)
        .eq("stage", "lost")
        .gte("lost_at", range.start.toISOString())
        .lte("lost_at", range.end.toISOString());
      if (error) throw error;
      return (data ?? []) as { assigned_to: string | null }[];
    },
  });

  const allLeads = useQuery({
    queryKey: ["lb-leads-ids", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb.from("crm_leads").select("id").eq("company_id", companyId);
      if (error) throw error;
      return ((data ?? []) as { id: string }[]).map((r) => r.id);
    },
  });

  const activities = useQuery({
    queryKey: ["lb-activities", companyId, period, allLeads.data?.length ?? 0],
    enabled: !!companyId && !!allLeads.data && allLeads.data.length > 0,
    queryFn: async () => {
      const { data, error } = await sb
        .from("crm_lead_activities")
        .select("user_id, activity_type")
        .in("lead_id", allLeads.data!)
        .gte("occurred_at", range.start.toISOString())
        .lte("occurred_at", range.end.toISOString());
      if (error) throw error;
      return (data ?? []) as { user_id: string | null; activity_type: string }[];
    },
  });

  const rows = useMemo(() => {
    type Row = {
      userId: string;
      name: string;
      revenue: number;
      deals: number;
      lost: number;
      winRate: number;
      activities: number;
      calls: number;
      emails: number;
      messages: number;
    };
    const blank = (id: string, name: string): Row => ({
      userId: id, name, revenue: 0, deals: 0, lost: 0, winRate: 0,
      activities: 0, calls: 0, emails: 0, messages: 0,
    });
    const map = new Map<string, Row>();
    for (const m of members.data ?? []) {
      map.set(m.id, blank(m.id, m.full_name ?? m.email ?? m.id));
    }
    for (const w of wonLeads.data ?? []) {
      if (!w.assigned_to) continue;
      let r = map.get(w.assigned_to);
      if (!r) { r = blank(w.assigned_to, "Unknown"); map.set(w.assigned_to, r); }
      r.revenue += Number(w.expected_value) || 0;
      r.deals += 1;
    }
    for (const l of lostLeads.data ?? []) {
      if (!l.assigned_to) continue;
      let r = map.get(l.assigned_to);
      if (!r) { r = blank(l.assigned_to, "Unknown"); map.set(l.assigned_to, r); }
      r.lost += 1;
    }
    for (const a of activities.data ?? []) {
      if (!a.user_id) continue;
      let r = map.get(a.user_id);
      if (!r) { r = blank(a.user_id, "Unknown"); map.set(a.user_id, r); }
      r.activities += 1;
      if (a.activity_type === "call") r.calls += 1;
      else if (a.activity_type === "email") r.emails += 1;
      else if (a.activity_type === "whatsapp" || a.activity_type === "sms") r.messages += 1;
    }
    const arr = Array.from(map.values());
    for (const r of arr) {
      const denom = r.deals + r.lost;
      r.winRate = denom > 0 ? Math.round((r.deals / denom) * 100) : 0;
    }
    arr.sort((a, b) => (b[metric] as number) - (a[metric] as number));
    return arr;
  }, [members.data, wonLeads.data, lostLeads.data, activities.data, metric]);

  const top = rows[0];
  const total = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        revenue: acc.revenue + r.revenue,
        deals: acc.deals + r.deals,
        activities: acc.activities + r.activities,
      }),
      { revenue: 0, deals: 0, activities: 0 },
    );
  }, [rows]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Leaderboard</h1>
        <p className="text-sm text-muted-foreground">Team rankings for {range.label}.</p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="quarter">This quarter</SelectItem>
              <SelectItem value="year">This year</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-1 rounded-md border p-1">
            {(["revenue", "deals", "activities", "calls"] as Metric[]).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={cn(
                  "rounded px-3 py-1 text-xs font-medium capitalize transition-colors",
                  metric === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            Team total: <span className="font-semibold text-foreground">
              {metric === "revenue" ? formatBDT(total.revenue) : (metric === "deals" ? total.deals : total.activities)}
            </span>
          </div>
        </div>
      </Card>

      {top && top[metric] > 0 && (
        <Card className="overflow-hidden bg-gradient-to-br from-amber-500/10 via-amber-400/5 to-transparent p-6">
          <div className="flex items-center gap-4">
            <div className="flex size-16 items-center justify-center rounded-full bg-amber-500/20">
              <Trophy className="size-8 text-amber-600" />
            </div>
            <div className="flex-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Top performer</div>
              <div className="text-2xl font-bold">{top.name}</div>
              <div className="text-sm text-muted-foreground">
                {metric === "revenue" && `${formatBDT(top.revenue)} closed-won`}
                {metric === "deals" && `${top.deals} deals won`}
                {metric === "activities" && `${top.activities} activities logged`}
                {metric === "calls" && `${top.calls} calls made`}
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card className="divide-y">
        {members.isLoading || wonLeads.isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No team members yet.</div>
        ) : (
          rows.map((r, i) => {
            const value = r[metric];
            const max = top ? (top[metric] as number) || 1 : 1;
            const pct = max > 0 ? Math.min(100, ((value as number) / max) * 100) : 0;
            return (
              <div key={r.userId} className="p-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    i === 0 && "bg-amber-500/20 text-amber-700",
                    i === 1 && "bg-slate-400/20 text-slate-600",
                    i === 2 && "bg-orange-700/20 text-orange-700",
                    i > 2 && "bg-muted text-muted-foreground",
                  )}>
                    {i === 0 ? <Trophy className="size-5" /> : i === 1 ? <Medal className="size-5" /> : i === 2 ? <Award className="size-5" /> : `#${i + 1}`}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{r.name}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><CheckCircle2 className="size-3" /> {r.deals} won</span>
                      <span className="inline-flex items-center gap-1"><Phone className="size-3" /> {r.calls}</span>
                      <span className="inline-flex items-center gap-1"><Mail className="size-3" /> {r.emails}</span>
                      <span className="inline-flex items-center gap-1"><MessageSquare className="size-3" /> {r.messages}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold">
                      {metric === "revenue" ? formatMoney(r.revenue, "USD") : (value as number)}
                    </div>
                  </div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full transition-all",
                      i === 0 ? "bg-amber-500" : i === 1 ? "bg-slate-400" : i === 2 ? "bg-orange-600" : "bg-primary/40",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
