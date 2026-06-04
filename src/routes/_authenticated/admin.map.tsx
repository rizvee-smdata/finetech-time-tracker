import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapView, type MapPoint } from "@/components/gps/MapView";
import { format } from "date-fns";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/map")({
  component: AdminMapPage,
});

// Distinct colors per rep
const PALETTE = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

function AdminMapPage() {
  const { companyId, roles } = useAuth() as any;
  const isStaff = roles?.includes("admin") || roles?.includes("manager");

  const { data: rows = [] } = useQuery({
    queryKey: ["admin-map", companyId],
    enabled: !!companyId && isStaff,
    refetchInterval: 30_000,
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data } = await supabase.from("visit_checkins")
        .select("id, user_id, client_name, checkin_lat, checkin_lng, checkin_time, checkout_time, is_geofence_valid")
        .eq("company_id", companyId!)
        .gte("checkin_time", `${today}T00:00:00`)
        .order("checkin_time", { ascending: false });
      // latest per user
      const latest = new Map<string, any>();
      for (const r of data ?? []) if (!latest.has(r.user_id)) latest.set(r.user_id, r);
      const userIds = [...latest.keys()];
      const profileMap = new Map<string, string>();
      if (userIds.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
        (profiles ?? []).forEach((p) => profileMap.set(p.id, p.full_name ?? "Rep"));
      }
      return [...latest.values()].map((r, i) => ({
        ...r,
        rep_name: profileMap.get(r.user_id) ?? "Rep",
        color: PALETTE[i % PALETTE.length],
      }));
    },
  });

  if (!isStaff) {
    return (
      <Card className="mx-auto mt-10 max-w-md p-6 text-center">
        <ShieldAlert className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm">Admin or manager role required to view the live map.</p>
      </Card>
    );
  }

  const points: MapPoint[] = rows.map((r) => ({
    lat: r.checkin_lat, lng: r.checkin_lng, color: r.color, title: r.rep_name,
    label: (r.rep_name as string).slice(0, 1).toUpperCase(),
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Live rep map</h1>
          <p className="text-sm text-muted-foreground">Latest check-in per rep today · auto-refresh 30s</p>
        </div>
        <Badge variant="outline">{rows.length} active</Badge>
      </div>

      {rows.length > 0 ? <MapView points={points} height={460} /> : (
        <Card className="p-6 text-center text-sm text-muted-foreground">No rep check-ins yet today.</Card>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <Card key={r.id} className="flex items-start gap-3 p-3">
            <div className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: r.color }} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{r.rep_name}</div>
              <div className="truncate text-xs text-muted-foreground">{r.client_name ?? "Unknown client"}</div>
              <div className="text-xs text-muted-foreground">
                {format(new Date(r.checkin_time), "p")} · {r.checkout_time ? "checked out" : "on-site"}
              </div>
            </div>
            {!r.is_geofence_valid && <Badge variant="outline" className="border-warning text-warning">override</Badge>}
          </Card>
        ))}
      </div>
    </div>
  );
}
