import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { PlanCard } from "@/components/planning/PlanCard";
import type { RoutePlan } from "@/lib/planning/types";

export const Route = createFileRoute("/_authenticated/planning/upcoming")({
  component: UpcomingView,
});

function UpcomingView() {
  const { user, companyId } = useAuth();
  const today = new Date().toISOString().slice(0, 10);

  const plans = useQuery({
    queryKey: ["planning", "upcoming", user?.id, companyId],
    enabled: !!user?.id && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_plans")
        .select("*")
        .eq("user_id", user!.id)
        .eq("company_id", companyId!)
        .gte("plan_date", today)
        .order("plan_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RoutePlan[];
    },
  });

  const stops = useQuery({
    queryKey: ["planning", "upcoming-stops", plans.data?.map((p) => p.id).join(",")],
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

  if (plans.isLoading) return <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>;
  if ((plans.data ?? []).length === 0)
    return <Card className="p-6 text-sm text-muted-foreground">No upcoming plans.</Card>;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {plans.data!.map((p) => {
        const c = counts(p.id);
        return <PlanCard key={p.id} plan={p} stopCount={c.total} doneCount={c.done} />;
      })}
    </div>
  );
}
