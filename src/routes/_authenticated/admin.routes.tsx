import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, MapPin } from "lucide-react";
import { getTeamRoutesForDate } from "@/lib/routePlanner/api";
import { DEFAULT_OFFICE } from "@/lib/routePlanner/types";

const RouteMap = lazy(() => import("@/components/route/RouteMap").then((m) => ({ default: m.RouteMap })));

export const Route = createFileRoute("/_authenticated/admin/routes")({
  component: AdminRoutesPage,
});

const REP_COLORS = ["#6366f1", "#ec4899", "#10b981", "#f59e0b", "#0ea5e9", "#a855f7", "#ef4444", "#14b8a6"];

function AdminRoutesPage() {
  const { companyId, isStaff } = useAuth();
  const [filter, setFilter] = useState<string>("all");
  const dateIso = new Date().toISOString().slice(0, 10);

  const { data } = useQuery({
    queryKey: ["team-routes", companyId, dateIso],
    enabled: !!companyId && isStaff,
    queryFn: () => getTeamRoutesForDate(companyId!, dateIso),
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-min", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, email");
      return (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>;
    },
  });

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const repColor = useMemo(() => {
    const map = new Map<string, string>();
    let i = 0;
    for (const p of data?.plans ?? []) {
      if (!map.has(p.user_id)) {
        map.set(p.user_id, REP_COLORS[i % REP_COLORS.length]);
        i++;
      }
    }
    return map;
  }, [data?.plans]);

  const filteredPlans = useMemo(() => {
    if (!data) return [];
    return filter === "all" ? data.plans : data.plans.filter((p) => p.user_id === filter);
  }, [data, filter]);

  const allStops = useMemo(() => {
    if (!data) return [];
    return filteredPlans.flatMap((p) =>
      (data.stopsByPlan[p.id] || [])
        .filter((s) => s.latitude != null && s.longitude != null)
        .map((s) => ({
          id: s.id,
          sequence: s.sequence,
          lat: s.latitude!,
          lng: s.longitude!,
          label: `${profileById.get(p.user_id)?.full_name || "Rep"} · ${s.customer_name}`,
          priority: s.priority,
          color: repColor.get(p.user_id) || "#6366f1",
        })),
    );
  }, [data, filteredPlans, profileById, repColor]);

  if (!isStaff) {
    return <div className="p-6 text-sm text-muted-foreground">Manager access required.</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Team Routes Today
          </h1>
          <p className="text-sm text-muted-foreground">
            {filteredPlans.length} active plan{filteredPlans.length === 1 ? "" : "s"}
          </p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All reps</SelectItem>
            {data?.plans.map((p) => (
              <SelectItem key={p.user_id} value={p.user_id}>
                {profileById.get(p.user_id)?.full_name || profileById.get(p.user_id)?.email || "Rep"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      <Card className="p-3">
        <Suspense fallback={<div className="h-[480px] bg-muted rounded animate-pulse" />}>
          <RouteMap stops={allStops} start={{ lat: DEFAULT_OFFICE.lat, lng: DEFAULT_OFFICE.lng, label: DEFAULT_OFFICE.label }} height={480} />
        </Suspense>
      </Card>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredPlans.map((p) => {
          const stops = data?.stopsByPlan[p.id] || [];
          const done = stops.filter((s) => s.checked_in).length;
          const prof = profileById.get(p.user_id);
          return (
            <Card key={p.id} className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ background: repColor.get(p.user_id) }}
                />
                <div className="font-medium truncate">{prof?.full_name || prof?.email || "Rep"}</div>
                <Badge variant="outline" className="ml-auto text-xs">
                  {p.status}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {done}/{stops.length} stops · {p.total_distance_km?.toFixed(1) ?? "—"} km
              </div>
              <ul className="text-xs space-y-1">
                {stops.slice(0, 5).map((s) => (
                  <li key={s.id} className="flex items-center gap-1 truncate">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {s.sequence}. {s.customer_name}
                    </span>
                    {s.checked_in && <span className="text-emerald-600">✓</span>}
                  </li>
                ))}
                {stops.length > 5 && <li className="text-muted-foreground">+{stops.length - 5} more</li>}
              </ul>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
