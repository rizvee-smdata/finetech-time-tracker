import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollText, Download, Filter, RefreshCw } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/audit")({
  beforeLoad: async () => {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles").select("role").eq("user_id", s.session.user.id);
    if (!(roles ?? []).some((r) => r.role === "admin")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: AuditPage,
});

type AuditRow = {
  id: string;
  company_id: string | null;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const ENTITY_TYPES = ["visit", "lead", "contract", "expense", "quote", "task", "company", "user_role"];
const ACTIONS = ["create", "update", "delete"];

const actionTone: Record<string, string> = {
  create: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  update: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  delete: "bg-rose-500/10 text-rose-600 border-rose-500/30",
};

function AuditPage() {
  const [entity, setEntity] = useState<string>("all");
  const [action, setAction] = useState<string>("all");
  const [days, setDays] = useState<string>("7");
  const [search, setSearch] = useState("");

  const since = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - Number(days));
    return d.toISOString();
  }, [days]);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["audit-logs", entity, action, days],
    queryFn: async () => {
      let q = (supabase.from("audit_logs" as any) as any)
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      if (entity !== "all") q = q.eq("entity_type", entity);
      if (action !== "all") q = q.eq("action", action);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  // Fetch actor display info
  const actorIds = useMemo(
    () => Array.from(new Set((data ?? []).map((r) => r.actor_id).filter(Boolean))) as string[],
    [data],
  );
  const { data: profiles } = useQuery({
    queryKey: ["audit-actors", actorIds.join(",")],
    enabled: actorIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", actorIds);
      return data ?? [];
    },
  });
  const actorMap = useMemo(() => {
    const m = new Map<string, { name: string; email: string | null }>();
    (profiles ?? []).forEach((p: any) =>
      m.set(p.id, { name: p.full_name ?? p.email ?? "User", email: p.email }),
    );
    return m;
  }, [profiles]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return data ?? [];
    return (data ?? []).filter((r) => {
      const a = r.actor_id ? actorMap.get(r.actor_id) : null;
      return (
        r.entity_type.includes(s) ||
        r.action.includes(s) ||
        (r.summary ?? "").toLowerCase().includes(s) ||
        (r.entity_id ?? "").toLowerCase().includes(s) ||
        (a?.name ?? "").toLowerCase().includes(s) ||
        (a?.email ?? "").toLowerCase().includes(s)
      );
    });
  }, [data, search, actorMap]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const creates = filtered.filter((r) => r.action === "create").length;
    const updates = filtered.filter((r) => r.action === "update").length;
    const deletes = filtered.filter((r) => r.action === "delete").length;
    return { total, creates, updates, deletes };
  }, [filtered]);

  const exportCsv = () => {
    const rows = [
      ["timestamp", "actor", "action", "entity_type", "entity_id", "summary"],
      ...filtered.map((r) => {
        const a = r.actor_id ? actorMap.get(r.actor_id) : null;
        return [
          r.created_at,
          a?.email ?? r.actor_id ?? "system",
          r.action,
          r.entity_type,
          r.entity_id ?? "",
          r.summary ?? "",
        ];
      }),
    ];
    const csv = rows
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ScrollText className="h-6 w-6 text-primary" />
            Audit log
          </h1>
          <p className="text-sm text-muted-foreground">
            Every create, update, and delete across the workspace — for compliance and accountability.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="mr-1 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Events" value={stats.total} />
        <StatCard label="Created" value={stats.creates} tone="text-emerald-600" />
        <StatCard label="Updated" value={stats.updates} tone="text-blue-600" />
        <StatCard label="Deleted" value={stats.deletes} tone="text-rose-600" />
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Filter className="h-4 w-4 text-muted-foreground" /> Filters
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Entity</Label>
            <Select value={entity} onValueChange={setEntity}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All entities</SelectItem>
                {ENTITY_TYPES.map((e) => (
                  <SelectItem key={e} value={e} className="capitalize">{e.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Action</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {ACTIONS.map((a) => (
                  <SelectItem key={a} value={a} className="capitalize">{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Time range</Label>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last 24 hours</SelectItem>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last year</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Search</Label>
            <Input
              placeholder="Actor, entity id, summary…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* Log table */}
      <Card className="overflow-hidden">
        <div className="border-b border-border bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
          Showing {filtered.length} of up to 500 most recent events
        </div>
        <div className="divide-y divide-border">
          {filtered.map((r) => {
            const actor = r.actor_id ? actorMap.get(r.actor_id) : null;
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <Badge variant="outline" className={`capitalize ${actionTone[r.action] ?? ""}`}>
                  {r.action}
                </Badge>
                <span className="font-medium capitalize">{r.entity_type.replace("_", " ")}</span>
                <span className="text-xs text-muted-foreground">
                  {r.entity_id ? `#${r.entity_id.slice(0, 8)}` : ""}
                </span>
                <span className="flex-1 truncate text-muted-foreground">
                  by <span className="font-medium text-foreground">{actor?.name ?? "System"}</span>
                  {actor?.email && <span className="ml-1 text-xs">({actor.email})</span>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(r.created_at), "MMM d, HH:mm:ss")}
                </span>
              </div>
            );
          })}
          {!filtered.length && (
            <div className="p-12 text-center text-sm text-muted-foreground">
              {isFetching ? "Loading audit events…" : "No events match the current filters."}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone ?? ""}`}>{value}</div>
    </Card>
  );
}
