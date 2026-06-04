import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { formatBDT } from "@/lib/manager/helpers";
import { ragColor, ragOf, ragOrder, worstFactor, type Rag, type ScoreFactor } from "@/lib/clientHealth";
import { Activity, AlertTriangle, ArrowRight, HeartPulse, RefreshCw, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/clients/health")({
  component: ClientHealthDashboard,
});

type Row = {
  id: string;
  account_id: string;
  assigned_rep_id: string | null;
  score: number;
  rag_status: Rag;
  last_visit_date: string | null;
  last_visit_days: number | null;
  open_deals_count: number;
  open_deals_value: number;
  pending_followups: number;
  score_breakdown: ScoreFactor[] | null;
  calculated_at: string;
  // joined
  account?: { name: string; industry: string | null } | null;
  rep?: { full_name: string | null } | null;
};

function ClientHealthDashboard() {
  const { companyId, isStaff } = useAuth();
  const [rag, setRag] = useState<"all" | Rag>("all");
  const [repId, setRepId] = useState<string>("all");
  const [industry, setIndustry] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["client-health", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("client_health_scores")
        .select("*, account:crm_accounts(name, industry), rep:profiles!client_health_scores_assigned_rep_id_fkey(full_name)" as any)
        .eq("company_id", companyId!)
        .order("score", { ascending: true });
      if (error) {
        // Fallback if FK alias unsupported — fetch reps separately.
        const { data: rows, error: e2 } = await supabase
          .from("client_health_scores")
          .select("*, account:crm_accounts(name, industry)")
          .eq("company_id", companyId!)
          .order("score", { ascending: true });
        if (e2) throw e2;
        const repIds = Array.from(new Set((rows ?? []).map((r: any) => r.assigned_rep_id).filter(Boolean)));
        const reps = repIds.length
          ? (await supabase.from("profiles").select("id, full_name").in("id", repIds)).data ?? []
          : [];
        const byId = new Map(reps.map((r: any) => [r.id, r]));
        return (rows ?? []).map((r: any) => ({ ...r, rep: byId.get(r.assigned_rep_id) ?? null }));
      }
      return (data ?? []) as Row[];
    },
  });

  const reps = useMemo(() => {
    const m = new Map<string, string>();
    (data ?? []).forEach((r) => {
      if (r.assigned_rep_id) m.set(r.assigned_rep_id, r.rep?.full_name ?? "Unnamed");
    });
    return Array.from(m, ([id, name]) => ({ id, name }));
  }, [data]);

  const industries = useMemo(() => {
    const s = new Set<string>();
    (data ?? []).forEach((r) => { if (r.account?.industry) s.add(r.account.industry); });
    return Array.from(s).sort();
  }, [data]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? [])
      .filter((r) => rag === "all" || r.rag_status === rag)
      .filter((r) => repId === "all" || r.assigned_rep_id === repId)
      .filter((r) => industry === "all" || r.account?.industry === industry)
      .filter((r) => !q || (r.account?.name ?? "").toLowerCase().includes(q))
      .sort((a, b) => ragOrder(a.rag_status) - ragOrder(b.rag_status) || a.score - b.score);
  }, [data, rag, repId, industry, search]);

  const stats = useMemo(() => {
    const all = data ?? [];
    const green = all.filter((r) => r.rag_status === "green").length;
    const amber = all.filter((r) => r.rag_status === "amber").length;
    const red = all.filter((r) => r.rag_status === "red").length;
    const revenueAtRisk = all
      .filter((r) => r.rag_status === "red")
      .reduce((s, r) => s + Number(r.open_deals_value || 0), 0);
    return { total: all.length, green, amber, red, revenueAtRisk };
  }, [data]);

  async function recompute() {
    setRefreshing(true);
    try {
      const { error } = await supabase.functions.invoke("compute-client-health", {
        body: { company_id: companyId },
      });
      if (error) throw error;
      toast.success("Scores refreshed");
      await refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <HeartPulse className="h-6 w-6 text-primary" /> Client Health
          </h1>
          <p className="text-sm text-muted-foreground">
            Daily-scored accounts. Red clients rise to top.
          </p>
        </div>
        {isStaff && (
          <Button onClick={recompute} disabled={refreshing} variant="outline" size="sm">
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Recompute now
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiTile label="Total Clients" value={stats.total} icon={<ShieldCheck className="h-4 w-4" />} />
        <KpiTile label="Green" value={stats.green} tone="green" />
        <KpiTile label="Amber" value={stats.amber} tone="amber" />
        <KpiTile label="Red" value={stats.red} tone="red" />
        <KpiTile
          label="Revenue at Risk"
          value={formatBDT(stats.revenueAtRisk)}
          tone="red"
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </div>

      {/* Filters */}
      <Card className="p-3">
        <div className="grid gap-2 md:grid-cols-5">
          <Input
            placeholder="Search client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={rag} onValueChange={(v) => setRag(v as any)}>
            <SelectTrigger><SelectValue placeholder="RAG" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All RAG</SelectItem>
              <SelectItem value="red">Red</SelectItem>
              <SelectItem value="amber">Amber</SelectItem>
              <SelectItem value="green">Green</SelectItem>
            </SelectContent>
          </Select>
          <Select value={repId} onValueChange={setRepId}>
            <SelectTrigger><SelectValue placeholder="Rep" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All reps</SelectItem>
              {reps.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={industry} onValueChange={setIndustry}>
            <SelectTrigger><SelectValue placeholder="Industry" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All industries</SelectItem>
              {industries.map((i) => (
                <SelectItem key={i} value={i}>{i}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="text-sm text-muted-foreground self-center px-2">
            {rows.length} shown
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Rep</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead className="text-center">Score</TableHead>
                  <TableHead>Last Visit</TableHead>
                  <TableHead>Open Deals</TableHead>
                  <TableHead>Key Signal</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.account?.name ?? "—"}</TableCell>
                    <TableCell>{r.rep?.full_name ?? "—"}</TableCell>
                    <TableCell>{r.account?.industry ?? "—"}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={ragColor(r.rag_status)}>
                        {r.score}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.last_visit_days === null || r.last_visit_days >= 9999
                        ? "Never"
                        : `${r.last_visit_days} d ago`}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.open_deals_count} · {formatBDT(r.open_deals_value)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {worstFactor(r.score_breakdown)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/clients/$clientId/health" params={{ clientId: r.account_id }}>
                          Open <ArrowRight className="ml-1 h-3 w-3" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-10">
                      <Activity className="mx-auto mb-2 h-5 w-5" />
                      No clients match your filters. {isStaff && "Try \"Recompute now\"."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

function KpiTile({
  label, value, tone, icon,
}: {
  label: string;
  value: number | string;
  tone?: "green" | "amber" | "red";
  icon?: React.ReactNode;
}) {
  const t =
    tone === "green" ? "border-emerald-500/30" :
    tone === "amber" ? "border-amber-500/30" :
    tone === "red" ? "border-rose-500/30" : "";
  return (
    <Card className={`p-4 ${t}`}>
      <div className="flex items-center justify-between text-xs uppercase text-muted-foreground">
        <span>{label}</span>{icon}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </Card>
  );
}
