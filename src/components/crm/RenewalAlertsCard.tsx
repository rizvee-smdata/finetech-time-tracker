import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, ArrowRight } from "lucide-react";

type RenewalLead = {
  id: string;
  customer_name: string;
  company_name: string | null;
  renewal_date: string;
  expected_value: number | null;
  currency: string | null;
};

/** Dashboard widget: renewals due within the next 60 days for the account manager. */
export function RenewalAlertsCard() {
  const { user, isStaff, companyId, ready } = useAuth();

  const { data } = useQuery({
    queryKey: ["dashboard-renewals", user?.id, isStaff, companyId],
    enabled: ready && !!user,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const horizon = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);
      let q = (supabase as any)
        .from("crm_leads")
        .select("id, customer_name, company_name, renewal_date, expected_value, currency")
        .eq("stage", "won")
        .neq("renewal_kind", "one_time")
        .gte("renewal_date", today)
        .lte("renewal_date", horizon)
        .order("renewal_date", { ascending: true })
        .limit(8);
      if (companyId) q = q.eq("company_id", companyId);
      if (!isStaff && user) q = q.eq("assigned_to", user.id);
      const { data: rows, error } = await q;
      if (error) throw error;
      return (rows ?? []) as RenewalLead[];
    },
  });

  const rows = data ?? [];

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold">
          <RefreshCw className="h-4 w-4" /> Renewals due (60 days)
        </h2>
        <Link to="/crm/renewals" className="text-sm text-primary hover:underline">
          View all <ArrowRight className="inline h-3 w-3" />
        </Link>
      </div>
      <div className="space-y-3">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No renewals in the next 60 days.</p>}
        {rows.map((r) => {
          const days = Math.max(
            0,
            Math.round((new Date(r.renewal_date).getTime() - Date.now()) / 86400_000),
          );
          return (
            <Link
              key={r.id}
              to="/crm/$leadId"
              params={{ leadId: r.id }}
              className="block rounded-md border border-border p-3 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{r.customer_name}</div>
                <Badge variant={days <= 30 ? "destructive" : "secondary"}>in {days}d</Badge>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {r.company_name ? `${r.company_name} · ` : ""}
                {r.renewal_date}
                {r.expected_value != null
                  ? ` · ${r.currency ?? "USD"} ${Number(r.expected_value).toLocaleString()}`
                  : ""}
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
