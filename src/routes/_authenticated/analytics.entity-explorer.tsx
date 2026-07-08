import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { fetchCompanyMembers } from "@/lib/crm/queries";
import { STAGES, ACTIVE_STAGES, stageMeta, formatBDT, LEAD_SOURCES, type CrmStage } from "@/lib/crm/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Building2, Handshake, User, Search, Calendar, TrendingUp, Users, MapPin, ChevronRight } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  LineChart, Line, Legend,
} from "recharts";
import { format, subDays, startOfYear, differenceInDays, startOfWeek, addWeeks, isSameWeek, subMonths, startOfMonth } from "date-fns";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/analytics/entity-explorer")({
  component: EntityExplorerPage,
});

type EntityType = "customer" | "partner" | "salesperson";
type Entity = { id: string; name: string; type: EntityType; sub?: string | null; ids?: string[] };
type Timeframe = "30" | "60" | "90" | "ytd";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];

function tfRange(tf: Timeframe) {
  const end = new Date();
  const start = tf === "ytd" ? startOfYear(end) : subDays(end, Number(tf));
  return { start, end };
}

function EntityExplorerPage() {
  const { companyId } = useAuth();
  const [tf, setTf] = useState<Timeframe>("30");
  const [entity, setEntity] = useState<Entity | null>(null);
  const [history, setHistory] = useState<Entity[]>([]);

  function pick(e: Entity) {
    setEntity(e);
    setHistory((prev) => [e, ...prev.filter((x) => !(x.id === e.id && x.type === e.type))].slice(0, 5));
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Entity Analyzer</h1>
        <p className="text-sm text-muted-foreground">
          One search box. 360° view for any customer, partner, or salesperson.
        </p>
      </header>

      <Card className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <EntitySearch companyId={companyId} onPick={pick} current={entity} />
          <div className="ml-auto flex items-center gap-1">
            {(["30", "60", "90", "ytd"] as Timeframe[]).map((v) => (
              <Button key={v} size="sm" variant={tf === v ? "default" : "outline"} onClick={() => setTf(v)}>
                {v === "ytd" ? "YTD" : `${v}d`}
              </Button>
            ))}
          </div>
        </div>
        {history.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <span className="text-muted-foreground">Recent:</span>
            {history.map((e) => (
              <Button key={`${e.type}-${e.id}`} variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs"
                onClick={() => setEntity(e)}>
                <TypeIcon type={e.type} /> {e.name}
              </Button>
            ))}
          </div>
        )}
      </Card>

      {!entity && (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Search above to analyze a customer, partner, or salesperson.
        </Card>
      )}

      {entity?.type === "customer" && <CustomerView companyId={companyId} entity={entity} tf={tf} onJump={pick} />}
      {entity?.type === "partner" && <PartnerView companyId={companyId} entity={entity} tf={tf} onJump={pick} />}
      {entity?.type === "salesperson" && <SalespersonView companyId={companyId} entity={entity} tf={tf} onJump={pick} />}
    </div>
  );
}

function TypeIcon({ type }: { type: EntityType }) {
  if (type === "customer") return <Building2 className="h-3.5 w-3.5" />;
  if (type === "partner") return <Handshake className="h-3.5 w-3.5" />;
  return <User className="h-3.5 w-3.5" />;
}

/* ----------------------------- Search ----------------------------- */

function EntitySearch({
  companyId, onPick, current,
}: { companyId: string | null; onPick: (e: Entity) => void; current: Entity | null }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const accounts = useQuery({
    queryKey: ["ea-accounts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await sb.from("customers")
        .select("id, customer_name, kind, tier, region")
        .eq("company_id", companyId).is("deleted_at", null)
        .in("kind", ["customer", "partner"]);
      return (data ?? []) as { id: string; customer_name: string; kind: string; tier: string | null; region: string | null }[];
    },
  });

  const members = useQuery({
    queryKey: ["ea-members", companyId],
    enabled: !!companyId,
    queryFn: () => fetchCompanyMembers(companyId!),
  });

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const groupByName = (kind: "customer" | "partner"): Entity[] => {
      const rows = (accounts.data ?? []).filter(
        (a) => a.kind === kind && (!needle || a.customer_name.toLowerCase().includes(needle)),
      );
      const groups = new Map<string, { name: string; ids: string[]; tier: string | null; region: string | null }>();
      for (const r of rows) {
        const key = r.customer_name.trim().toLowerCase();
        const g = groups.get(key);
        if (g) {
          g.ids.push(r.id);
          if (!g.tier && r.tier) g.tier = r.tier;
          if (!g.region && r.region) g.region = r.region;
        } else {
          groups.set(key, { name: r.customer_name, ids: [r.id], tier: r.tier, region: r.region });
        }
      }
      return Array.from(groups.values())
        .slice(0, 8)
        .map((g) => ({
          id: g.ids[0],
          ids: g.ids,
          name: g.name,
          type: kind,
          sub: kind === "customer" ? (g.tier ?? g.region) : g.region,
        }));
    };
    const customers = groupByName("customer");
    const partners = groupByName("partner");
    const reps: Entity[] = ((members.data ?? []) as any[])
      .filter((m) => {
        const label = (m.full_name || m.email || "").toLowerCase();
        return !needle || label.includes(needle);
      })
      .slice(0, 8)
      .map((m) => ({ id: m.user_id ?? m.id, name: m.full_name || m.email || "Unnamed", type: "salesperson" as const, sub: m.email }));
    return { customers, partners, reps };
  }, [q, accounts.data, members.data]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="min-w-[280px] justify-start gap-2">
          <Search className="h-4 w-4" />
          {current ? (
            <span className="flex items-center gap-1.5 truncate">
              <TypeIcon type={current.type} /> {current.name}
            </span>
          ) : (
            <span className="text-muted-foreground">Analyze a customer, partner, or salesperson…</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[380px] p-0">
        <div className="border-b p-2">
          <Input autoFocus placeholder="Type to search…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="max-h-[400px] overflow-y-auto p-1 text-sm">
          <Section label="Customers" icon={<Building2 className="h-3.5 w-3.5" />}
            items={results.customers} onPick={(e) => { onPick(e); setOpen(false); }} />
          <Section label="Partners" icon={<Handshake className="h-3.5 w-3.5" />}
            items={results.partners} onPick={(e) => { onPick(e); setOpen(false); }} />
          <Section label="Salespeople" icon={<User className="h-3.5 w-3.5" />}
            items={results.reps} onPick={(e) => { onPick(e); setOpen(false); }} />
          {!results.customers.length && !results.partners.length && !results.reps.length && (
            <p className="p-4 text-center text-xs text-muted-foreground">No matches.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Section({ label, icon, items, onPick }: {
  label: string; icon: React.ReactNode; items: Entity[]; onPick: (e: Entity) => void;
}) {
  if (!items.length) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium uppercase text-muted-foreground">
        {icon} {label}
      </div>
      {items.map((e) => (
        <button key={`${e.type}-${e.id}`}
          className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-accent"
          onClick={() => onPick(e)}>
          <span className="truncate">{e.name}</span>
          {e.sub && <span className="ml-2 shrink-0 text-xs text-muted-foreground">{e.sub}</span>}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------- Shared helpers ----------------------------- */

function KpiCard({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string }) {
  return (
    <Card className="p-3">
      <div className="text-[11px] font-medium uppercase text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${tone ?? ""}`}>{value}</div>
      {sub != null && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-3">
      <div className="mb-2 text-sm font-semibold">{title}</div>
      <div className="h-64">{children}</div>
    </Card>
  );
}

function StageBadge({ stage }: { stage: CrmStage }) {
  const m = stageMeta(stage);
  return <Badge className={m.badge}>{m.label}</Badge>;
}

function useProfiles(ids: (string | null | undefined)[]) {
  const clean = Array.from(new Set(ids.filter(Boolean))) as string[];
  return useQuery({
    queryKey: ["ea-profiles", clean.sort().join(",")],
    enabled: clean.length > 0,
    queryFn: async () => {
      const { data } = await sb.from("profiles").select("id, full_name, email").in("id", clean);
      const map = new Map<string, { id: string; full_name: string | null; email: string | null }>();
      (data ?? []).forEach((p: any) => map.set(p.id, p));
      return map;
    },
  });
}

function useAccounts(companyId: string | null) {
  return useQuery({
    queryKey: ["ea-account-map", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await sb.from("customers").select("id, customer_name, kind, tier")
        .eq("company_id", companyId).is("deleted_at", null);
      const map = new Map<string, { id: string; customer_name: string; kind: string; tier: string | null }>();
      (data ?? []).forEach((c: any) => map.set(c.id, c));
      return map;
    },
  });
}

function VisitsPerWeekChart({ visits, tf }: { visits: any[]; tf: Timeframe }) {
  const data = useMemo(() => {
    const { start, end } = tfRange(tf);
    const buckets: { week: string; count: number; date: Date }[] = [];
    let cur = startOfWeek(start);
    while (cur <= end) {
      buckets.push({ week: format(cur, "MMM d"), date: cur, count: 0 });
      cur = addWeeks(cur, 1);
    }
    visits.forEach((v) => {
      const d = new Date(v.meeting_at);
      const b = buckets.find((x) => isSameWeek(x.date, d));
      if (b) b.count += 1;
    });
    return buckets;
  }, [visits, tf]);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <XAxis dataKey="week" fontSize={11} />
        <YAxis fontSize={11} allowDecimals={false} />
        <Tooltip />
        <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ----------------------------- Customer view ----------------------------- */

function CustomerView({ companyId, entity, tf, onJump }: {
  companyId: string | null; entity: Entity; tf: Timeframe; onJump: (e: Entity) => void;
}) {
  const { start, end } = tfRange(tf);

  const visits = useQuery({
    queryKey: ["ea-cust-visits", companyId, entity.id, tf],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await sb.from("customer_visits")
        .select("id, meeting_at, user_id, discussion_summary, next_action, contact_type, company")
        .eq("company_id", companyId).eq("account_id", entity.id)
        .gte("meeting_at", start.toISOString()).lte("meeting_at", end.toISOString())
        .order("meeting_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const lastVisit = useQuery({
    queryKey: ["ea-cust-lastvisit", companyId, entity.id],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await sb.from("customer_visits").select("meeting_at")
        .eq("company_id", companyId).eq("account_id", entity.id)
        .order("meeting_at", { ascending: false }).limit(1);
      return data?.[0]?.meeting_at ?? null;
    },
  });

  const leads = useQuery({
    queryKey: ["ea-cust-leads", companyId, entity.id],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await sb.from("crm_leads")
        .select("id, customer_name, company_name, stage, expected_value, probability, expected_close_date, assigned_to, lead_source, partner_id, won_at")
        .eq("company_id", companyId).eq("customer_id", entity.id).is("deleted_at", null);
      return (data ?? []) as any[];
    },
  });

  const profileIds = [...(visits.data ?? []).map((v) => v.user_id), ...(leads.data ?? []).map((l) => l.assigned_to)];
  const profiles = useProfiles(profileIds);
  const accounts = useAccounts(companyId);

  const daysSince = lastVisit.data ? differenceInDays(new Date(), new Date(lastVisit.data)) : null;
  const openLeads = (leads.data ?? []).filter((l) => ACTIVE_STAGES.includes(l.stage));
  const openValue = openLeads.reduce((s, l) => s + (Number(l.expected_value) || 0), 0);
  const wonValue = (leads.data ?? []).filter((l) => l.stage === "won").reduce((s, l) => s + (Number(l.expected_value) || 0), 0);
  const distinctReps = new Set((visits.data ?? []).map((v) => v.user_id).filter(Boolean)).size;

  const funnelData = useMemo(() => {
    return STAGES.filter((s) => s.id !== "lost").map((s) => {
      const rows = (leads.data ?? []).filter((l) => l.stage === s.id);
      return { stage: s.label, count: rows.length, value: rows.reduce((a, l) => a + (Number(l.expected_value) || 0), 0) };
    });
  }, [leads.data]);

  const sourceData = useMemo(() => {
    const grp = new Map<string, number>();
    (leads.data ?? []).forEach((l) => {
      const k = l.lead_source ?? "manual";
      grp.set(k, (grp.get(k) ?? 0) + 1);
    });
    return Array.from(grp.entries()).map(([k, v]) => ({
      name: LEAD_SOURCES.find((s) => s.id === k)?.label ?? k, value: v,
    }));
  }, [leads.data]);

  const partnerReferred = (leads.data ?? []).filter((l) => l.partner_id);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Building2 className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">{entity.name}</h2>
        <Badge variant="outline">Customer</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Visits in period" value={visits.data?.length ?? 0} />
        <KpiCard label="Distinct reps" value={distinctReps} />
        <KpiCard label="Days since last visit"
          value={daysSince == null ? "—" : daysSince}
          tone={daysSince == null ? "" : daysSince > 60 ? "text-red-600" : daysSince > 30 ? "text-amber-600" : "text-green-600"} />
        <KpiCard label="Open opportunities" value={openLeads.length} sub={formatBDT(openValue)} />
        <KpiCard label="Won (all-time)" value={formatBDT(wonValue)} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Visit timeline (per week)">
          <VisitsPerWeekChart visits={visits.data ?? []} tf={tf} />
        </ChartCard>
        <ChartCard title="Opportunity funnel">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnelData} layout="vertical" margin={{ left: 60 }}>
              <XAxis type="number" fontSize={11} allowDecimals={false} />
              <YAxis type="category" dataKey="stage" fontSize={11} width={100} />
              <Tooltip formatter={(v: any, n: any) => n === "value" ? formatBDT(Number(v)) : v} />
              <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {sourceData.length > 0 && (
        <ChartCard title="Lead source mix">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={sourceData} dataKey="value" nameKey="name" outerRadius={90} innerRadius={50} label>
                {sourceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <Card className="p-3">
        <div className="mb-2 text-sm font-semibold">Opportunities</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b"><th className="p-2 text-left">Title</th><th className="p-2 text-left">Stage</th>
                <th className="p-2 text-right">Value</th><th className="p-2 text-right">Prob</th>
                <th className="p-2 text-left">Close</th><th className="p-2 text-left">Owner</th><th className="p-2 text-left">Partner</th></tr>
            </thead>
            <tbody>
              {(leads.data ?? []).map((l) => {
                const p = l.partner_id ? accounts.data?.get(l.partner_id) : null;
                const owner = l.assigned_to ? profiles.data?.get(l.assigned_to) : null;
                return (
                  <tr key={l.id} className="border-b hover:bg-accent/50">
                    <td className="p-2"><Link to="/crm/$leadId" params={{ leadId: l.id }} className="hover:underline">{l.customer_name}</Link></td>
                    <td className="p-2"><StageBadge stage={l.stage} /></td>
                    <td className="p-2 text-right">{formatBDT(Number(l.expected_value) || 0)}</td>
                    <td className="p-2 text-right">{l.probability ?? "—"}%</td>
                    <td className="p-2">{l.expected_close_date ?? "—"}</td>
                    <td className="p-2">
                      {owner ? (
                        <button className="text-primary hover:underline"
                          onClick={() => onJump({ id: l.assigned_to, name: owner.full_name || owner.email || "Rep", type: "salesperson" })}>
                          {owner.full_name || owner.email}
                        </button>
                      ) : "—"}
                    </td>
                    <td className="p-2">
                      {p ? (
                        <button className="text-primary hover:underline"
                          onClick={() => onJump({ id: p.id, name: p.customer_name, type: "partner" })}>
                          {p.customer_name}
                        </button>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
              {!(leads.data ?? []).length && <tr><td colSpan={7} className="p-6 text-center text-xs text-muted-foreground">No opportunities.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <VisitLogTable visits={visits.data ?? []} profiles={profiles.data} onJumpRep={(id, name) => onJump({ id, name, type: "salesperson" })} />

      {partnerReferred.length > 0 && (
        <Card className="p-3">
          <div className="mb-1 text-sm font-semibold">Referring partners</div>
          <div className="flex flex-wrap gap-1.5">
            {Array.from(new Set(partnerReferred.map((l) => l.partner_id))).map((pid) => {
              const p = accounts.data?.get(pid);
              if (!p) return null;
              return (
                <Button key={pid} variant="outline" size="sm" className="h-7 gap-1"
                  onClick={() => onJump({ id: p.id, name: p.customer_name, type: "partner" })}>
                  <Handshake className="h-3 w-3" /> {p.customer_name}
                  <ChevronRight className="h-3 w-3" />
                </Button>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ----------------------------- Partner view ----------------------------- */

function PartnerView({ companyId, entity, tf, onJump }: {
  companyId: string | null; entity: Entity; tf: Timeframe; onJump: (e: Entity) => void;
}) {
  const { start, end } = tfRange(tf);

  const visits = useQuery({
    queryKey: ["ea-part-visits", companyId, entity.id, tf],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await sb.from("customer_visits")
        .select("id, meeting_at, user_id, discussion_summary, next_action")
        .eq("company_id", companyId).eq("account_id", entity.id)
        .gte("meeting_at", start.toISOString()).lte("meeting_at", end.toISOString())
        .order("meeting_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const lastVisit = useQuery({
    queryKey: ["ea-part-lastvisit", companyId, entity.id],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await sb.from("customer_visits").select("meeting_at")
        .eq("company_id", companyId).eq("account_id", entity.id)
        .order("meeting_at", { ascending: false }).limit(1);
      return data?.[0]?.meeting_at ?? null;
    },
  });

  const referred = useQuery({
    queryKey: ["ea-part-referred", companyId, entity.id],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await sb.from("crm_leads")
        .select("id, customer_name, customer_id, stage, expected_value, expected_close_date, assigned_to, won_at, created_at")
        .eq("company_id", companyId).eq("partner_id", entity.id).is("deleted_at", null);
      return (data ?? []) as any[];
    },
  });

  const profiles = useProfiles([...(visits.data ?? []).map((v) => v.user_id), ...(referred.data ?? []).map((l) => l.assigned_to)]);
  const accounts = useAccounts(companyId);

  const daysSince = lastVisit.data ? differenceInDays(new Date(), new Date(lastVisit.data)) : null;
  const open = (referred.data ?? []).filter((l) => ACTIVE_STAGES.includes(l.stage));
  const won = (referred.data ?? []).filter((l) => l.stage === "won");
  const lost = (referred.data ?? []).filter((l) => l.stage === "lost");
  const winRate = won.length + lost.length > 0 ? Math.round((won.length * 100) / (won.length + lost.length)) : 0;

  const funnel = STAGES.filter((s) => s.id !== "lost").map((s) => ({
    stage: s.label,
    count: (referred.data ?? []).filter((l) => l.stage === s.id).length,
    value: (referred.data ?? []).filter((l) => l.stage === s.id).reduce((a, l) => a + (Number(l.expected_value) || 0), 0),
  }));

  const trend = useMemo(() => {
    const months: { m: string; date: Date; referred: number; won: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = startOfMonth(subMonths(new Date(), i));
      months.push({ m: format(d, "MMM"), date: d, referred: 0, won: 0 });
    }
    (referred.data ?? []).forEach((l) => {
      const c = new Date(l.created_at);
      const b = months.find((x) => x.date.getMonth() === c.getMonth() && x.date.getFullYear() === c.getFullYear());
      if (b) b.referred += 1;
      if (l.won_at) {
        const w = new Date(l.won_at);
        const wb = months.find((x) => x.date.getMonth() === w.getMonth() && x.date.getFullYear() === w.getFullYear());
        if (wb) wb.won += Number(l.expected_value) || 0;
      }
    });
    return months;
  }, [referred.data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Handshake className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">{entity.name}</h2>
        <Badge variant="outline">Partner</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <KpiCard label="Our visits to them" value={visits.data?.length ?? 0} />
        <KpiCard label="Days since last visit"
          value={daysSince == null ? "—" : daysSince}
          tone={daysSince == null ? "" : daysSince > 60 ? "text-red-600" : daysSince > 30 ? "text-amber-600" : "text-green-600"} />
        <KpiCard label="Deals referred" value={referred.data?.length ?? 0} />
        <KpiCard label="Open pipeline" value={formatBDT(open.reduce((s, l) => s + (Number(l.expected_value) || 0), 0))} />
        <KpiCard label="Won value" value={formatBDT(won.reduce((s, l) => s + (Number(l.expected_value) || 0), 0))} />
        <KpiCard label="Win rate" value={`${winRate}%`} sub={`${won.length}W / ${lost.length}L`} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Visit timeline (per week)">
          <VisitsPerWeekChart visits={visits.data ?? []} tf={tf} />
        </ChartCard>
        <ChartCard title="Referral funnel">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnel} layout="vertical" margin={{ left: 60 }}>
              <XAxis type="number" fontSize={11} allowDecimals={false} />
              <YAxis type="category" dataKey="stage" fontSize={11} width={100} />
              <Tooltip />
              <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Referral trend (12 months)">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trend}>
            <XAxis dataKey="m" fontSize={11} />
            <YAxis yAxisId="l" fontSize={11} allowDecimals={false} />
            <YAxis yAxisId="r" orientation="right" fontSize={11} />
            <Tooltip formatter={(v: any, n: any) => n === "won" ? formatBDT(Number(v)) : v} />
            <Legend />
            <Line yAxisId="l" type="monotone" dataKey="referred" stroke="#3b82f6" strokeWidth={2} />
            <Line yAxisId="r" type="monotone" dataKey="won" stroke="#10b981" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <Card className="p-3">
        <div className="mb-2 text-sm font-semibold">Referred opportunities</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b"><th className="p-2 text-left">Title</th><th className="p-2 text-left">Customer</th>
                <th className="p-2 text-left">Stage</th><th className="p-2 text-right">Value</th>
                <th className="p-2 text-left">Owner</th><th className="p-2 text-left">Close</th></tr>
            </thead>
            <tbody>
              {(referred.data ?? []).map((l) => {
                const cust = l.customer_id ? accounts.data?.get(l.customer_id) : null;
                const owner = l.assigned_to ? profiles.data?.get(l.assigned_to) : null;
                return (
                  <tr key={l.id} className="border-b hover:bg-accent/50">
                    <td className="p-2"><Link to="/crm/$leadId" params={{ leadId: l.id }} className="hover:underline">{l.customer_name}</Link></td>
                    <td className="p-2">
                      {cust ? (
                        <button className="text-primary hover:underline"
                          onClick={() => onJump({ id: cust.id, name: cust.customer_name, type: "customer" })}>
                          {cust.customer_name}
                        </button>
                      ) : "—"}
                    </td>
                    <td className="p-2"><StageBadge stage={l.stage} /></td>
                    <td className="p-2 text-right">{formatBDT(Number(l.expected_value) || 0)}</td>
                    <td className="p-2">
                      {owner ? (
                        <button className="text-primary hover:underline"
                          onClick={() => onJump({ id: l.assigned_to, name: owner.full_name || owner.email || "Rep", type: "salesperson" })}>
                          {owner.full_name || owner.email}
                        </button>
                      ) : "—"}
                    </td>
                    <td className="p-2">{l.expected_close_date ?? "—"}</td>
                  </tr>
                );
              })}
              {!(referred.data ?? []).length && <tr><td colSpan={6} className="p-6 text-center text-xs text-muted-foreground">No referred deals. Set partner on the deal form.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <VisitLogTable visits={visits.data ?? []} profiles={profiles.data} onJumpRep={(id, name) => onJump({ id, name, type: "salesperson" })} />
    </div>
  );
}

/* ----------------------------- Salesperson view ----------------------------- */

function SalespersonView({ companyId, entity, tf, onJump }: {
  companyId: string | null; entity: Entity; tf: Timeframe; onJump: (e: Entity) => void;
}) {
  const { start, end } = tfRange(tf);

  const visits = useQuery({
    queryKey: ["ea-rep-visits", companyId, entity.id, tf],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await sb.from("customer_visits")
        .select("id, meeting_at, account_id, customer_name, company, discussion_summary")
        .eq("company_id", companyId).eq("user_id", entity.id)
        .gte("meeting_at", start.toISOString()).lte("meeting_at", end.toISOString())
        .order("meeting_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const leads = useQuery({
    queryKey: ["ea-rep-leads", companyId, entity.id, tf],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await sb.from("crm_leads")
        .select("id, customer_name, customer_id, stage, expected_value, expected_close_date, probability, partner_id, won_at")
        .eq("company_id", companyId).eq("assigned_to", entity.id).is("deleted_at", null);
      return (data ?? []) as any[];
    },
  });

  const assigned = useQuery({
    queryKey: ["ea-rep-assigned", companyId, entity.id],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await sb.from("customers").select("id").eq("company_id", companyId)
        .is("deleted_at", null).eq("assigned_rep_id", entity.id);
      return (data ?? []) as { id: string }[];
    },
  });

  const accounts = useAccounts(companyId);

  const uniqueAccounts = new Set((visits.data ?? []).map((v) => v.account_id).filter(Boolean));
  const coverage = assigned.data?.length ? Math.round((uniqueAccounts.size * 100) / assigned.data.length) : 0;
  const open = (leads.data ?? []).filter((l) => ACTIVE_STAGES.includes(l.stage));
  const openValue = open.reduce((s, l) => s + (Number(l.expected_value) || 0), 0);
  const wonInPeriod = (leads.data ?? []).filter((l) => l.won_at && new Date(l.won_at) >= start && new Date(l.won_at) <= end);
  const wonValue = wonInPeriod.reduce((s, l) => s + (Number(l.expected_value) || 0), 0);

  const perAccount = useMemo(() => {
    const grp = new Map<string, { id: string | null; name: string; kind: string; count: number }>();
    (visits.data ?? []).forEach((v) => {
      const key = v.account_id ?? v.customer_name;
      const acct = v.account_id ? accounts.data?.get(v.account_id) : null;
      const cur = grp.get(key) ?? {
        id: v.account_id, name: acct?.customer_name ?? v.customer_name ?? v.company ?? "Unknown",
        kind: acct?.kind ?? "customer", count: 0,
      };
      cur.count += 1;
      grp.set(key, cur);
    });
    return Array.from(grp.values()).sort((a, b) => b.count - a.count).slice(0, 12);
  }, [visits.data, accounts.data]);

  const pipelineByStage = ACTIVE_STAGES.map((s) => {
    const rows = (leads.data ?? []).filter((l) => l.stage === s);
    return { stage: stageMeta(s).label, count: rows.length, value: rows.reduce((a, l) => a + (Number(l.expected_value) || 0), 0) };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <User className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">{entity.name}</h2>
        <Badge variant="outline">Salesperson</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <KpiCard label="Total visits" value={visits.data?.length ?? 0} />
        <KpiCard label="Unique clients" value={uniqueAccounts.size} />
        <KpiCard label="Coverage %"
          value={`${coverage}%`}
          sub={`${uniqueAccounts.size} / ${assigned.data?.length ?? 0} assigned`}
          tone={coverage < 40 ? "text-red-600" : coverage < 70 ? "text-amber-600" : "text-green-600"} />
        <KpiCard label="Open pipeline" value={open.length} sub={formatBDT(openValue)} />
        <KpiCard label="Won in period" value={wonInPeriod.length} sub={formatBDT(wonValue)} />
        <KpiCard label="Deals total" value={leads.data?.length ?? 0} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Visit timeline (per week)">
          <VisitsPerWeekChart visits={visits.data ?? []} tf={tf} />
        </ChartCard>
        <ChartCard title="Pipeline by stage">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pipelineByStage}>
              <XAxis dataKey="stage" fontSize={10} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip formatter={(v: any, n: any) => n === "value" ? formatBDT(Number(v)) : v} />
              <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Client visit distribution (top 12)">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={perAccount} layout="vertical" margin={{ left: 100 }}
            onClick={(e: any) => {
              const idx = e?.activeTooltipIndex;
              if (idx == null) return;
              const item = perAccount[idx];
              if (item?.id) onJump({ id: item.id, name: item.name, type: item.kind === "partner" ? "partner" : "customer" });
            }}>
            <XAxis type="number" fontSize={11} allowDecimals={false} />
            <YAxis type="category" dataKey="name" fontSize={11} width={140} />
            <Tooltip />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {perAccount.map((a, i) => <Cell key={i} fill={a.kind === "partner" ? "#10b981" : "#3b82f6"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <Card className="p-3">
        <div className="mb-2 text-sm font-semibold">Clients visited</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b"><th className="p-2 text-left">Account</th><th className="p-2 text-left">Type</th>
                <th className="p-2 text-right">Visits</th></tr>
            </thead>
            <tbody>
              {perAccount.map((a) => (
                <tr key={a.name} className="border-b hover:bg-accent/50">
                  <td className="p-2">
                    {a.id ? (
                      <button className="text-primary hover:underline"
                        onClick={() => onJump({ id: a.id!, name: a.name, type: a.kind === "partner" ? "partner" : "customer" })}>
                        {a.name}
                      </button>
                    ) : a.name}
                  </td>
                  <td className="p-2"><Badge variant="outline">{a.kind}</Badge></td>
                  <td className="p-2 text-right">{a.count}</td>
                </tr>
              ))}
              {!perAccount.length && <tr><td colSpan={3} className="p-6 text-center text-xs text-muted-foreground">No visits in this period.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-3">
        <div className="mb-2 text-sm font-semibold">Their opportunities</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b"><th className="p-2 text-left">Title</th><th className="p-2 text-left">Account</th>
                <th className="p-2 text-left">Stage</th><th className="p-2 text-right">Value</th>
                <th className="p-2 text-right">Prob</th><th className="p-2 text-left">Partner</th></tr>
            </thead>
            <tbody>
              {(leads.data ?? []).map((l) => {
                const cust = l.customer_id ? accounts.data?.get(l.customer_id) : null;
                const p = l.partner_id ? accounts.data?.get(l.partner_id) : null;
                return (
                  <tr key={l.id} className="border-b hover:bg-accent/50">
                    <td className="p-2"><Link to="/crm/$leadId" params={{ leadId: l.id }} className="hover:underline">{l.customer_name}</Link></td>
                    <td className="p-2">
                      {cust ? (
                        <button className="text-primary hover:underline"
                          onClick={() => onJump({ id: cust.id, name: cust.customer_name, type: "customer" })}>
                          {cust.customer_name}
                        </button>
                      ) : "—"}
                    </td>
                    <td className="p-2"><StageBadge stage={l.stage} /></td>
                    <td className="p-2 text-right">{formatBDT(Number(l.expected_value) || 0)}</td>
                    <td className="p-2 text-right">{l.probability ?? "—"}%</td>
                    <td className="p-2">
                      {p ? (
                        <button className="text-primary hover:underline"
                          onClick={() => onJump({ id: p.id, name: p.customer_name, type: "partner" })}>
                          {p.customer_name}
                        </button>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
              {!(leads.data ?? []).length && <tr><td colSpan={6} className="p-6 text-center text-xs text-muted-foreground">No opportunities.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ----------------------------- Visit log ----------------------------- */

function VisitLogTable({ visits, profiles, onJumpRep }: {
  visits: any[]; profiles?: Map<string, { id: string; full_name: string | null; email: string | null }>;
  onJumpRep: (id: string, name: string) => void;
}) {
  return (
    <Card className="p-3">
      <div className="mb-2 text-sm font-semibold">Visit log</div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b"><th className="p-2 text-left">Date</th><th className="p-2 text-left">Salesperson</th>
              <th className="p-2 text-left">Discussion</th><th className="p-2 text-left">Next action</th></tr>
          </thead>
          <tbody>
            {visits.map((v) => {
              const p = v.user_id ? profiles?.get(v.user_id) : null;
              return (
                <tr key={v.id} className="border-b align-top hover:bg-accent/50">
                  <td className="p-2 whitespace-nowrap">{v.meeting_at ? format(new Date(v.meeting_at), "MMM d, yyyy") : "—"}</td>
                  <td className="p-2">
                    {p ? (
                      <button className="text-primary hover:underline"
                        onClick={() => onJumpRep(v.user_id, p.full_name || p.email || "Rep")}>
                        {p.full_name || p.email}
                      </button>
                    ) : "—"}
                  </td>
                  <td className="p-2 max-w-md truncate">{v.discussion_summary ?? "—"}</td>
                  <td className="p-2 max-w-xs truncate">{v.next_action ?? "—"}</td>
                </tr>
              );
            })}
            {!visits.length && <tr><td colSpan={4} className="p-6 text-center text-xs text-muted-foreground">No visits in this period.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
