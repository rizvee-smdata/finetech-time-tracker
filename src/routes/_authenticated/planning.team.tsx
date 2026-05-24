import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { PlanCard } from "@/components/planning/PlanCard";
import type { RoutePlan } from "@/lib/planning/types";

export const Route = createFileRoute("/_authenticated/planning/team")({
  component: TeamView,
});

function TeamView() {
  const { companyId, isStaff } = useAuth();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const plans = useQuery({
    queryKey: ["planning", "team", companyId, date],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_plans")
        .select("*")
        .eq("company_id", companyId!)
        .eq("plan_date", date)
        .order("user_id");
      if (error) throw error;
      return (data ?? []) as RoutePlan[];
    },
  });

  const userIds = Array.from(new Set((plans.data ?? []).map((p) => p.user_id)));
  const profiles = useQuery({
    queryKey: ["planning", "team-profiles", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const stops = useQuery({
    queryKey: ["planning", "team-stops", plans.data?.map((p) => p.id).join(",")],
    enabled: !!plans.data && plans.data.length > 0,
    queryFn: async () => {
      const ids = plans.data!.map((p) => p.id);
      const { data, error } = await supabase
        .from("route_plan_stops")
        .select("plan_id, status")
        .in("plan_id", ids);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!isStaff) return <Card className="p-6 text-sm text-muted-foreground">Manager access only.</Card>;

  const counts = (planId: string) => {
    const all = (stops.data ?? []).filter((s) => s.plan_id === planId);
    return { total: all.length, done: all.filter((s) => s.status === "completed").length };
  };
  const repName = (id: string) => {
    const p = (profiles.data ?? []).find((x: any) => x.id === id);
    return p?.full_name || p?.email || "Rep";
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          </div>
          <div className="text-sm text-muted-foreground">{(plans.data ?? []).length} plans</div>
        </div>
      </Card>
      {plans.isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>
      ) : (plans.data ?? []).length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No plans for this date.</Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {plans.data!.map((p) => {
            const c = counts(p.id);
            return <PlanCard key={p.id} plan={p} stopCount={c.total} doneCount={c.done} repName={repName(p.user_id)} />;
          })}
        </div>
      )}
    </div>
  );
}
