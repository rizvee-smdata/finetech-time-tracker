import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertTriangle, Clock, RefreshCw, MoonStar, MapPin } from "lucide-react";
import { recalculateVisitGaps, snoozeAccount } from "@/lib/visit-analytics/gaps.functions";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/visits/due")({
  component: MyVisitsDue,
});

type GapRow = {
  customer_id: string;
  company_id: string;
  assigned_rep_id: string | null;
  tier: string | null;
  last_visit_date: string | null;
  days_since_last_visit: number | null;
  expected_interval_days: number;
  gap_score: number;
  priority: "critical" | "high" | "due_soon" | "healthy";
  open_pipeline_value: number;
  has_near_close: boolean;
  customer: { customer_name: string; kind: string | null; city: string | null; region: string | null } | null;
};

const PRIORITY_META: Record<GapRow["priority"], { label: string; icon: any; color: string; band: string }> = {
  critical: { label: "Critical", icon: AlertTriangle, color: "text-red-600", band: "border-red-500/50 bg-red-50 dark:bg-red-950/20" },
  high: { label: "High", icon: AlertTriangle, color: "text-orange-600", band: "border-orange-500/50 bg-orange-50 dark:bg-orange-950/20" },
  due_soon: { label: "Due Soon", icon: Clock, color: "text-amber-600", band: "border-amber-500/50 bg-amber-50 dark:bg-amber-950/20" },
  healthy: { label: "Healthy", icon: Clock, color: "text-emerald-600", band: "" },
};

function MyVisitsDue() {
  const { user, companyId, isStaff } = useAuth();
  const qc = useQueryClient();
  const [scope, setScope] = useState<"me" | "team">("me");
  const recalc = useServerFn(recalculateVisitGaps);
  const snooze = useServerFn(snoozeAccount);

  const { data, isLoading } = useQuery({
    queryKey: ["visit-gaps", companyId, scope, user?.id],
    enabled: !!user && !!companyId,
    queryFn: async () => {
      // Active snoozes for current user
      const { data: snoozes } = await supabase
        .from("visit_snoozes")
        .select("customer_id, snoozed_until")
        .gt("snoozed_until", new Date().toISOString());
      const snoozedIds = new Set((snoozes ?? []).map((s: any) => s.customer_id));

      const q = supabase
        .from("visit_gap_scores")
        .select("customer_id, company_id, assigned_rep_id, tier, last_visit_date, days_since_last_visit, expected_interval_days, gap_score, priority, open_pipeline_value, has_near_close")
        .eq("company_id", companyId!)
        .neq("priority", "healthy")
        .order("gap_score", { ascending: false });
      if (scope === "me" && user) q.eq("assigned_rep_id", user.id);
      const { data: gaps, error } = await q;
      if (error) throw error;

      const rows = (gaps ?? []) as any[];
      const ids = rows.map((r) => r.customer_id);
      let custMap = new Map<string, any>();
      if (ids.length) {
        const { data: cs } = await supabase
          .from("customers")
          .select("id, customer_name, kind, city, region")
          .in("id", ids);
        custMap = new Map((cs ?? []).map((c: any) => [c.id, c]));
      }
      return rows
        .map((r) => ({ ...r, customer: custMap.get(r.customer_id) ?? null }))
        .filter((r) => !snoozedIds.has(r.customer_id)) as GapRow[];
    },
  });

  const grouped = useMemo(() => {
    const g: Record<"critical" | "high" | "due_soon", GapRow[]> = { critical: [], high: [], due_soon: [] };
    (data ?? []).forEach((r) => {
      if (r.priority !== "healthy") g[r.priority].push(r);
    });
    return g;
  }, [data]);

  const recalcMut = useMutation({
    mutationFn: () => recalc({ data: { companyId: companyId! } }),
    onSuccess: (r) => {
      toast.success(`Recalculated ${r.count} accounts`);
      qc.invalidateQueries({ queryKey: ["visit-gaps"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const snoozeMut = useMutation({
    mutationFn: (customerId: string) => snooze({ data: { customerId, companyId: companyId!, days: 7 } }),
    onSuccess: () => {
      toast.success("Snoozed for 7 days");
      qc.invalidateQueries({ queryKey: ["visit-gaps"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My visits due</h1>
          <p className="text-sm text-muted-foreground">Accounts overdue for a visit based on tier interval and pipeline weighting.</p>
        </div>
        <div className="flex items-center gap-2">
          {isStaff && (
            <div className="flex rounded-md border p-0.5">
              <Button size="sm" variant={scope === "me" ? "default" : "ghost"} onClick={() => setScope("me")}>Mine</Button>
              <Button size="sm" variant={scope === "team" ? "default" : "ghost"} onClick={() => setScope("team")}>Team</Button>
            </div>
          )}
          {isStaff && (
            <Button size="sm" variant="outline" onClick={() => recalcMut.mutate()} disabled={recalcMut.isPending}>
              <RefreshCw className={`mr-2 h-4 w-4 ${recalcMut.isPending ? "animate-spin" : ""}`} />
              Recalculate now
            </Button>
          )}
        </div>
      </header>

      {isLoading && <Card className="p-10 text-center text-sm text-muted-foreground">Loading…</Card>}

      {!isLoading && (data?.length ?? 0) === 0 && (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          🎉 Nothing overdue. All your accounts are healthy.
          {isStaff && <div className="mt-2 text-xs">If this looks wrong, click "Recalculate now" above.</div>}
        </Card>
      )}

      {(["critical", "high", "due_soon"] as const).map((p) => {
        const rows = grouped[p];
        if (!rows.length) return null;
        const meta = PRIORITY_META[p];
        const Icon = meta.icon;
        return (
          <section key={p} className="space-y-2">
            <h2 className={`flex items-center gap-2 text-sm font-semibold ${meta.color}`}>
              <Icon className="h-4 w-4" />
              {meta.label} <Badge variant="secondary">{rows.length}</Badge>
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {rows.map((r) => (
                <Card key={r.customer_id} className={`${meta.band} border`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between gap-2">
                      <span>{r.customer?.customer_name ?? "—"}</span>
                      <Badge variant="outline" className="capitalize text-xs">{r.customer?.kind ?? ""}</Badge>
                    </CardTitle>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 items-center">
                      {r.tier && <Badge variant="secondary" className="capitalize">{r.tier.replace("_", " ")}</Badge>}
                      {r.customer?.city && (
                        <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{r.customer.city}</span>
                      )}
                      {r.has_near_close && <Badge className="bg-red-600 text-white">Deal closing ≤30d</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p>
                      Expected every <b>{r.expected_interval_days}</b> days · last visited{" "}
                      <b>
                        {r.last_visit_date
                          ? formatDistanceToNow(new Date(r.last_visit_date), { addSuffix: true })
                          : "never"}
                      </b>
                      {r.days_since_last_visit != null && r.last_visit_date && (
                        <> ({r.days_since_last_visit} days ago)</>
                      )}
                      {r.open_pipeline_value > 0 && (
                        <> · <b>৳ {Number(r.open_pipeline_value).toLocaleString()}</b> open pipeline</>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button asChild size="sm">
                        <Link
                          to="/visits/new"
                          search={{
                            company: r.customer?.customer_name ?? "",
                          } as any}
                        >
                          Log visit
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => snoozeMut.mutate(r.customer_id)}
                        disabled={snoozeMut.isPending}
                      >
                        <MoonStar className="mr-2 h-4 w-4" />
                        Snooze 7d
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
