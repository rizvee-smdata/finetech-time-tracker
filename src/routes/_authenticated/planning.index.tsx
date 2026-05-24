import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Route as RouteIcon } from "lucide-react";
import { PlanCard } from "@/components/planning/PlanCard";
import type { RoutePlan } from "@/lib/planning/types";

export const Route = createFileRoute("/_authenticated/planning/")({
  component: TodayView,
});

function TodayView() {
  const { user, companyId } = useAuth();
  const today = new Date().toISOString().slice(0, 10);

  const plans = useQuery({
    queryKey: ["planning", "today", user?.id, companyId, today],
    enabled: !!user?.id && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_plans")
        .select("*")
        .eq("user_id", user!.id)
        .eq("company_id", companyId!)
        .eq("plan_date", today)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RoutePlan[];
    },
  });

  const stops = useQuery({
    queryKey: ["planning", "today-stops", plans.data?.map((p) => p.id).join(",")],
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

  const counts = (planId: string) => {
    const all = (stops.data ?? []).filter((s) => s.plan_id === planId);
    return { total: all.length, done: all.filter((s) => s.status === "completed").length };
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button asChild size="sm"><Link to="/planning/new"><Plus className="mr-1 h-4 w-4" /> New plan</Link></Button>
      </div>
      {plans.isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>
      ) : (plans.data ?? []).length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <RouteIcon className="h-10 w-10 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">No plan for today yet.</div>
          <Button asChild size="sm"><Link to="/planning/new"><Plus className="mr-1 h-4 w-4" /> Create today's plan</Link></Button>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {plans.data!.map((p) => {
            const c = counts(p.id);
            return <PlanCard key={p.id} plan={p} stopCount={c.total} doneCount={c.done} />;
          })}
        </div>
      )}
    </div>
  );
}
