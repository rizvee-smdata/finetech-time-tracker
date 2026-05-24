import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/crm/types";
import { format, differenceInDays, parseISO } from "date-fns";
import { toast } from "sonner";
import { RefreshCw, Calendar, AlertCircle } from "lucide-react";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/crm/renewals")({
  component: RenewalsPage,
});

type RenewalLead = {
  id: string;
  customer_name: string;
  company_name: string | null;
  renewal_kind: string;
  renewal_date: string | null;
  expected_value: number | null;
  currency: string;
  stage: string;
  assigned_to: string | null;
  is_renewal: boolean;
  parent_lead_id: string | null;
};

function RenewalsPage() {
  const { companyId, ready } = useAuth();
  const qc = useQueryClient();

  const wonRecurring = useQuery({
    queryKey: ["crm-renewals-won", companyId],
    enabled: ready && !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("crm_leads")
        .select("id, customer_name, company_name, renewal_kind, renewal_date, expected_value, currency, stage, assigned_to, is_renewal, parent_lead_id")
        .eq("company_id", companyId)
        .eq("stage", "won")
        .neq("renewal_kind", "one_time")
        .not("renewal_date", "is", null)
        .order("renewal_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RenewalLead[];
    },
  });

  const generatedChildren = useQuery({
    queryKey: ["crm-renewals-children", companyId],
    enabled: ready && !!companyId,
    queryFn: async () => {
      const { data } = await sb
        .from("crm_leads")
        .select("id, parent_lead_id, stage")
        .eq("company_id", companyId)
        .eq("is_renewal", true);
      const map = new Map<string, { id: string; stage: string }>();
      for (const r of (data ?? []) as any[]) {
        if (r.parent_lead_id) map.set(r.parent_lead_id, { id: r.id, stage: r.stage });
      }
      return map;
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { error } = await sb.rpc("crm_generate_renewal_leads");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Renewal leads generated for deals due in 60 days");
      qc.invalidateQueries({ queryKey: ["crm-renewals-children"] });
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const today = new Date();
  const sorted = (wonRecurring.data ?? []).slice();
  const due = sorted.filter((l) => l.renewal_date && differenceInDays(parseISO(l.renewal_date), today) <= 60);
  const upcoming = sorted.filter((l) => l.renewal_date && differenceInDays(parseISO(l.renewal_date), today) > 60);

  function bucket(days: number) {
    if (days < 0) return { label: `${Math.abs(days)}d overdue`, variant: "destructive" as const };
    if (days <= 30) return { label: `Due in ${days}d`, variant: "destructive" as const };
    if (days <= 60) return { label: `Due in ${days}d`, variant: "default" as const };
    return { label: `Due in ${days}d`, variant: "secondary" as const };
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Renewals</h2>
          <p className="text-sm text-muted-foreground">Won deals with AMC, subscription, or retainer renewals.</p>
        </div>
        <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
          <RefreshCw className={`h-4 w-4 mr-2 ${generate.isPending ? "animate-spin" : ""}`} />
          Generate renewal leads (60-day window)
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Active recurring deals</div>
          <div className="text-2xl font-semibold">{sorted.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Due in 60 days</div>
          <div className="text-2xl font-semibold text-amber-600">{due.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Renewal pipeline (60d)</div>
          <div className="text-2xl font-semibold">
            {formatMoney(due.reduce((s, l) => s + (l.expected_value ?? 0), 0))}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><AlertCircle className="h-4 w-4" /> Due within 60 days</h3>
        {due.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming renewals in this window.</p>
        ) : (
          <div className="divide-y">
            {due.map((l) => {
              const days = differenceInDays(parseISO(l.renewal_date!), today);
              const b = bucket(days);
              const child = generatedChildren.data?.get(l.id);
              return (
                <div key={l.id} className="py-3 flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <Link to="/crm/$leadId" params={{ leadId: l.id }} className="font-medium hover:underline">
                      {l.customer_name}
                    </Link>
                    {l.company_name && <span className="text-sm text-muted-foreground"> · {l.company_name}</span>}
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {l.renewal_kind.toUpperCase()} · {formatMoney(l.expected_value, l.currency)}
                    </div>
                  </div>
                  <Badge variant="outline" className="gap-1"><Calendar className="h-3 w-3" />{format(parseISO(l.renewal_date!), "MMM d, yyyy")}</Badge>
                  <Badge variant={b.variant}>{b.label}</Badge>
                  {child ? (
                    <Link to="/crm/$leadId" params={{ leadId: child.id }}>
                      <Badge variant="secondary">Renewal lead: {child.stage}</Badge>
                    </Link>
                  ) : (
                    <Badge variant="outline">No renewal lead yet</Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="font-semibold mb-3">Upcoming (60+ days)</h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing further out.</p>
        ) : (
          <div className="divide-y">
            {upcoming.map((l) => (
              <div key={l.id} className="py-2 flex items-center gap-3 flex-wrap text-sm">
                <Link to="/crm/$leadId" params={{ leadId: l.id }} className="flex-1 min-w-[200px] font-medium hover:underline">
                  {l.customer_name}
                </Link>
                <span className="text-muted-foreground">{l.renewal_kind}</span>
                <span className="text-muted-foreground">{formatMoney(l.expected_value, l.currency)}</span>
                <Badge variant="outline">{format(parseISO(l.renewal_date!), "MMM d, yyyy")}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
