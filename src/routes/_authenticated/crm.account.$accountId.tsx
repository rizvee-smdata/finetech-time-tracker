import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/crm/types";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { Building2, Phone, Globe, MapPin, ArrowLeft, ArrowRight, FileText, Activity, Briefcase } from "lucide-react";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/crm/account/$accountId")({
  component: AccountDetailPage,
});

const STAGE_COLORS: Record<string, string> = {
  new: "bg-slate-500/15 text-slate-600",
  qualified: "bg-blue-500/15 text-blue-600",
  proposal: "bg-purple-500/15 text-purple-600",
  negotiation: "bg-amber-500/15 text-amber-700",
  won: "bg-emerald-500/15 text-emerald-600",
  lost: "bg-rose-500/15 text-rose-600",
};

function AccountDetailPage() {
  const { accountId } = Route.useParams();
  const { companyId } = useAuth();
  const navigate = useNavigate();

  const account = useQuery({
    queryKey: ["crm-account", accountId],
    queryFn: async () => {
      const { data, error } = await sb.from("crm_accounts").select("*").eq("id", accountId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const leads = useQuery({
    queryKey: ["crm-account-leads", accountId],
    queryFn: async () => {
      const { data, error } = await sb
        .from("crm_leads")
        .select("*")
        .eq("account_id", accountId)
        .order("last_activity_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const quotes = useQuery({
    queryKey: ["crm-account-quotes", accountId, leads.data?.length ?? 0],
    enabled: !!leads.data && leads.data.length > 0,
    queryFn: async () => {
      const ids = leads.data!.map((l) => l.id);
      const { data, error } = await sb
        .from("crm_quotes")
        .select("*")
        .in("lead_id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const activity = useQuery({
    queryKey: ["crm-account-activity", accountId, leads.data?.length ?? 0],
    enabled: !!leads.data && leads.data.length > 0,
    queryFn: async () => {
      const ids = leads.data!.map((l) => l.id);
      const { data, error } = await sb
        .from("crm_lead_activities")
        .select("*")
        .in("lead_id", ids)
        .order("occurred_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const leadMap = new Map(leads.data!.map((l) => [l.id, l]));
      return ((data ?? []) as any[]).map((a) => ({ ...a, lead: leadMap.get(a.lead_id) }));
    },
  });

  const territory = useQuery({
    queryKey: ["crm-territory", account.data?.territory_id],
    enabled: !!account.data?.territory_id,
    queryFn: async () => {
      const { data } = await sb.from("crm_territories").select("name").eq("id", account.data.territory_id).maybeSingle();
      return data as { name: string } | null;
    },
  });

  const owner = useQuery({
    queryKey: ["profile", account.data?.primary_owner],
    enabled: !!account.data?.primary_owner,
    queryFn: async () => {
      const { data } = await sb.from("profiles").select("full_name, email").eq("id", account.data.primary_owner).maybeSingle();
      return data as { full_name: string | null; email: string | null } | null;
    },
  });

  const stats = useMemo(() => {
    const list = leads.data ?? [];
    let open = 0, won = 0, lost = 0, pipeline = 0, wonValue = 0, weighted = 0;
    for (const l of list) {
      const v = Number(l.expected_value) || 0;
      if (l.stage === "won") { won++; wonValue += v; }
      else if (l.stage === "lost") lost++;
      else { open++; pipeline += v; weighted += v * (l.probability / 100); }
    }
    return { total: list.length, open, won, lost, pipeline, wonValue, weighted };
  }, [leads.data]);

  if (account.isLoading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading account…</div>;
  if (!account.data) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground">Account not found.</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => navigate({ to: "/crm/accounts" })}>
          ← Back to accounts
        </Button>
      </div>
    );
  }

  const a = account.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/crm/accounts" })}>
          <ArrowLeft className="size-4" /> Accounts
        </Button>
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="size-6 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold">{a.name}</h1>
              {a.industry && <div className="text-sm text-muted-foreground">{a.industry}</div>}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {a.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3" />{a.phone}</span>}
                {a.website && (
                  <a href={a.website.startsWith("http") ? a.website : `https://${a.website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-primary">
                    <Globe className="size-3" />{a.website}
                  </a>
                )}
                {a.address && <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{a.address}</span>}
                {territory.data && <span>Territory: <span className="text-foreground">{territory.data.name}</span></span>}
                {owner.data && <span>Owner: <span className="text-foreground">{owner.data.full_name ?? owner.data.email}</span></span>}
              </div>
            </div>
          </div>
        </div>
        {a.notes && <p className="mt-4 whitespace-pre-wrap rounded border bg-muted/30 p-3 text-sm">{a.notes}</p>}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Total leads" value={String(stats.total)} />
        <StatTile label="Open" value={String(stats.open)} />
        <StatTile label="Pipeline" value={formatMoney(stats.pipeline, "USD")} />
        <StatTile label="Weighted" value={formatMoney(stats.weighted, "USD")} tone="amber" />
        <StatTile label="Won revenue" value={formatMoney(stats.wonValue, "USD")} tone="emerald" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b p-3 text-sm font-semibold">
            <Briefcase className="size-4" /> Leads ({stats.total})
          </div>
          <div className="divide-y max-h-96 overflow-y-auto">
            {(leads.data ?? []).length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No leads yet under this account.</div>
            ) : (
              (leads.data ?? []).map((l) => (
                <Link
                  key={l.id}
                  to="/crm/$leadId"
                  params={{ leadId: l.id }}
                  className="flex items-center gap-3 p-3 hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{l.customer_name}</span>
                      <Badge className={STAGE_COLORS[l.stage] ?? ""}>{l.stage}</Badge>
                      <span className="text-xs text-muted-foreground">{l.probability}%</span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {l.contact_person ?? "—"}
                      {l.last_activity_at && ` · ${formatDistanceToNow(parseISO(l.last_activity_at), { addSuffix: true })}`}
                    </div>
                  </div>
                  <div className="text-right text-sm font-semibold">
                    {formatMoney(Number(l.expected_value) || 0, l.currency)}
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </Link>
              ))
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b p-3 text-sm font-semibold">
            <FileText className="size-4" /> Quotes ({quotes.data?.length ?? 0})
          </div>
          <div className="divide-y max-h-96 overflow-y-auto">
            {(quotes.data ?? []).length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No quotes for this account.</div>
            ) : (
              (quotes.data ?? []).map((q) => (
                <Link
                  key={q.id}
                  to="/crm/$leadId"
                  params={{ leadId: q.lead_id }}
                  className="flex items-center gap-3 p-3 hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{q.title}</span>
                      <Badge variant="outline" className="text-[10px]">v{q.version}</Badge>
                      <Badge variant="outline" className="capitalize">{q.status}</Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {format(parseISO(q.created_at), "MMM d, yyyy")}
                    </div>
                  </div>
                  <div className="text-right text-sm font-semibold">{formatMoney(Number(q.amount) || 0, q.currency)}</div>
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b p-3 text-sm font-semibold">
          <Activity className="size-4" /> Recent activity ({activity.data?.length ?? 0})
        </div>
        <div className="divide-y max-h-96 overflow-y-auto">
          {(activity.data ?? []).length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No activity logged yet.</div>
          ) : (
            (activity.data ?? []).map((a: any) => (
              <div key={a.id} className="flex gap-3 p-3 text-sm">
                <Badge variant="outline" className="h-5 shrink-0 text-[10px] capitalize">
                  {String(a.activity_type).replace("_", " ")}
                </Badge>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <Link to="/crm/$leadId" params={{ leadId: a.lead_id }} className="font-medium text-primary hover:underline">
                      {a.lead?.customer_name ?? "Lead"}
                    </Link>
                    {a.title && <span>· {a.title}</span>}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatDistanceToNow(parseISO(a.occurred_at), { addSuffix: true })}
                    </span>
                  </div>
                  {a.body && <div className="text-xs text-muted-foreground line-clamp-2">{a.body}</div>}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: "amber" | "emerald" }) {
  const toneClass = tone === "amber" ? "text-amber-700" : tone === "emerald" ? "text-emerald-600" : "text-foreground";
  return (
    <Card className="p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={"mt-1 text-lg font-semibold " + toneClass}>{value}</div>
    </Card>
  );
}
