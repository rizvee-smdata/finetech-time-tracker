import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ragColor, ragOf, worstFactor, type Rag, type ScoreFactor } from "@/lib/clientHealth";
import { formatBDT } from "@/lib/manager/helpers";
import { ArrowLeft, CalendarPlus, MessageCircle, Phone, ShieldCheck } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

export const Route = createFileRoute("/_authenticated/clients/$clientId/health")({
  component: ClientHealthDetail,
});

type Score = {
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
};

function ClientHealthDetail() {
  const { clientId } = Route.useParams();
  const { companyId, user } = useAuth();
  const qc = useQueryClient();

  const account = useQuery({
    queryKey: ["account", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_accounts")
        .select("id, name, industry, primary_owner, phone")
        .eq("id", clientId).single();
      if (error) throw error;
      return data;
    },
  });

  const score = useQuery({
    queryKey: ["client-health", clientId],
    queryFn: async (): Promise<Score | null> => {
      const { data, error } = await supabase
        .from("client_health_scores").select("*")
        .eq("account_id", clientId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const history = useQuery({
    queryKey: ["client-health-history", clientId],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("client_health_history").select("calculated_on, score, rag_status")
        .eq("account_id", clientId).gte("calculated_on", cutoff)
        .order("calculated_on");
      if (error) throw error;
      return (data ?? []).map((d: any) => ({
        date: d.calculated_on, score: d.score, rag: d.rag_status,
      }));
    },
  });

  const leads = useQuery({
    queryKey: ["client-leads", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_leads")
        .select("id, customer_name, stage, expected_value, currency, last_activity_at")
        .eq("account_id", clientId)
        .not("stage", "in", "(won,lost)")
        .order("last_activity_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const activity = useQuery({
    queryKey: ["client-activity", clientId],
    queryFn: async () => {
      const { data: leadRows } = await supabase
        .from("crm_leads").select("id").eq("account_id", clientId);
      const leadIds = (leadRows ?? []).map((l: any) => l.id);
      if (leadIds.length === 0) return [];
      const { data, error } = await supabase
        .from("crm_lead_activities")
        .select("id, activity_type, title, occurred_at, metadata")
        .in("lead_id", leadIds)
        .order("occurred_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const recompute = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("compute-client-health", {
        body: { account_id: clientId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Recomputed");
      qc.invalidateQueries({ queryKey: ["client-health", clientId] });
      qc.invalidateQueries({ queryKey: ["client-health-history", clientId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const scheduleVisit = useMutation({
    mutationFn: async () => {
      if (!companyId || !user) throw new Error("No company");
      const due = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { error } = await supabase.from("tms_tasks").insert({
        company_id: companyId,
        title: `Visit ${account.data?.name ?? "client"}`,
        description: `Auto-created from health score detail`,
        priority: "high",
        due_date: due,
        created_by: user.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => toast.success("Visit task scheduled"),
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const logCall = useMutation({
    mutationFn: async () => {
      const leadId = leads.data?.[0]?.id;
      if (!leadId) throw new Error("No open lead to log against");
      const { error } = await supabase.from("crm_lead_activities").insert({
        lead_id: leadId, user_id: user!.id, activity_type: "call",
        title: "Call logged from health dashboard",
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Call logged");
      qc.invalidateQueries({ queryKey: ["client-activity", clientId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const s = score.data;
  const rag: Rag = s ? s.rag_status : "green";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm"><Link to="/clients/health"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{account.data?.name ?? "Client"}</h1>
          <p className="text-sm text-muted-foreground">{account.data?.industry ?? "—"}</p>
        </div>
        <Button onClick={() => recompute.mutate()} disabled={recompute.isPending} variant="outline" size="sm">
          Recompute
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Gauge */}
        <Card className="p-6 md:col-span-1">
          <div className="text-xs uppercase text-muted-foreground">Health Score</div>
          {score.isLoading || !s ? <Skeleton className="mt-3 h-24 w-full" /> : (
            <>
              <div className="mt-2 flex items-baseline gap-2">
                <div className="text-6xl font-semibold tabular-nums">{s.score}</div>
                <Badge variant="outline" className={ragColor(rag)}>{rag.toUpperCase()}</Badge>
              </div>
              <div className="mt-3 h-2 rounded-full bg-muted">
                <div
                  className={`h-2 rounded-full ${rag === "green" ? "bg-emerald-500" : rag === "amber" ? "bg-amber-500" : "bg-rose-500"}`}
                  style={{ width: `${s.score}%` }}
                />
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                Updated {new Date(s.calculated_at).toLocaleString()}
              </div>
            </>
          )}
        </Card>

        {/* Breakdown */}
        <Card className="p-4 md:col-span-2">
          <div className="mb-3 text-sm font-medium">Score breakdown</div>
          {!s?.score_breakdown?.length ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
              <ShieldCheck className="h-4 w-4" /> No deductions — account is healthy.
            </div>
          ) : (
            <ul className="divide-y">
              {s.score_breakdown.map((f, i) => (
                <li key={i} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <div className="font-medium">{f.label}</div>
                    <div className="text-xs text-muted-foreground">{f.factor} · value {f.value}</div>
                  </div>
                  <div className="font-semibold text-rose-600 dark:text-rose-400">{f.deduction}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Trend */}
      <Card className="p-4">
        <div className="mb-2 text-sm font-medium">90-day trend</div>
        <div className="h-56">
          {history.isLoading ? <Skeleton className="h-full w-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history.data ?? []}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <ReferenceLine y={70} stroke="#10b981" strokeDasharray="3 3" />
                <ReferenceLine y={40} stroke="#f43f5e" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Activity log */}
        <Card className="p-4">
          <div className="mb-3 text-sm font-medium">Recent activity</div>
          {activity.isLoading ? <Skeleton className="h-40 w-full" /> : (
            <ul className="space-y-2 text-sm">
              {(activity.data ?? []).map((a: any) => (
                <li key={a.id} className="flex items-start justify-between gap-3 border-b pb-2 last:border-0">
                  <div>
                    <div className="font-medium">{a.title}</div>
                    <div className="text-xs text-muted-foreground">{a.activity_type}</div>
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(a.occurred_at).toLocaleDateString()}
                  </div>
                </li>
              ))}
              {(activity.data ?? []).length === 0 && (
                <li className="text-muted-foreground">No activities yet.</li>
              )}
            </ul>
          )}
        </Card>

        {/* Open deals */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium">Open deals</div>
            <div className="text-xs text-muted-foreground">
              {s ? `${s.open_deals_count} · ${formatBDT(s.open_deals_value)}` : "—"}
            </div>
          </div>
          {leads.isLoading ? <Skeleton className="h-40 w-full" /> : (
            <ul className="space-y-2 text-sm">
              {(leads.data ?? []).map((l: any) => (
                <li key={l.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <Link to="/crm/$leadId" params={{ leadId: l.id }} className="hover:underline">
                    {l.customer_name}
                  </Link>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] uppercase">{l.stage}</Badge>
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {formatBDT(Number(l.expected_value || 0))}
                    </span>
                  </div>
                </li>
              ))}
              {(leads.data ?? []).length === 0 && (
                <li className="text-muted-foreground">No open deals.</li>
              )}
            </ul>
          )}
        </Card>
      </div>

      {/* Quick actions */}
      <Card className="p-4">
        <div className="mb-3 text-sm font-medium">Quick actions</div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => scheduleVisit.mutate()} disabled={scheduleVisit.isPending}>
            <CalendarPlus className="mr-2 h-4 w-4" /> Schedule visit
          </Button>
          <Button variant="outline" onClick={() => logCall.mutate()} disabled={logCall.isPending}>
            <Phone className="mr-2 h-4 w-4" /> Log call
          </Button>
          {account.data?.phone && (
            <Button asChild variant="outline">
              <a target="_blank" rel="noreferrer"
                href={`https://wa.me/${account.data.phone.replace(/[^0-9]/g, "")}`}>
                <MessageCircle className="mr-2 h-4 w-4" /> Send WhatsApp
              </a>
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
