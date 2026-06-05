import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, MapPin, ExternalLink, NavigationIcon, Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_OFFICE, type RouteStopRow } from "@/lib/routePlanner/types";
import { bdt, formatMinutes, googleMapsLink, priorityBadgeClass } from "@/lib/routePlanner/utils";
import {
  finalizeMileage,
  getPlanStops,
  getTodayPlan,
  markStopCheckedIn,
  updatePlan,
} from "@/lib/routePlanner/api";

const RouteMap = lazy(() => import("@/components/route/RouteMap").then((m) => ({ default: m.RouteMap })));

export const Route = createFileRoute("/_authenticated/route/live")({
  component: LiveRoutePage,
});

function LiveRoutePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const dateIso = new Date().toISOString().slice(0, 10);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [completing, setCompleting] = useState(false);

  const { data: plan } = useQuery({
    queryKey: ["route-plan", user?.id, dateIso],
    enabled: !!user?.id,
    queryFn: () => getTodayPlan(user!.id, dateIso),
  });

  const { data: stops = [] } = useQuery({
    queryKey: ["route-plan-stops", plan?.id],
    enabled: !!plan?.id,
    queryFn: () => getPlanStops(plan!.id),
  });

  // Live geolocation
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const nextStop = useMemo(() => stops.find((s) => !s.checked_in), [stops]);
  const allDone = stops.length > 0 && stops.every((s) => s.checked_in);

  const mapStops = useMemo(
    () =>
      stops
        .filter((s) => s.latitude != null && s.longitude != null)
        .map((s) => ({
          id: s.id,
          sequence: s.sequence,
          lat: s.latitude!,
          lng: s.longitude!,
          label: s.customer_name,
          priority: s.priority,
          color: s.checked_in ? "#10b981" : undefined,
        })),
    [stops],
  );

  const checkIn = async (s: RouteStopRow) => {
    await markStopCheckedIn(s.id);
    if (plan && plan.status === "planned") {
      await updatePlan(plan.id, { status: "in_progress" } as any);
    }
    qc.invalidateQueries({ queryKey: ["route-plan-stops", plan?.id] });
    qc.invalidateQueries({ queryKey: ["route-plan", user?.id, dateIso] });
    toast.success(`Checked in at ${s.customer_name}`);
  };

  const completeRoute = async () => {
    if (!plan) return;
    setCompleting(true);
    try {
      const r = await finalizeMileage(plan, {
        lat: plan.start_latitude ?? DEFAULT_OFFICE.lat,
        lng: plan.start_longitude ?? DEFAULT_OFFICE.lng,
      });
      toast.success(`Route completed · ${r.km.toFixed(1)} km mileage expense created`);
      qc.invalidateQueries({ queryKey: ["route-plan", user?.id, dateIso] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to finalize");
    } finally {
      setCompleting(false);
    }
  };

  if (!plan) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card className="p-8 text-center space-y-3">
          <p className="text-muted-foreground">No route planned for today.</p>
          <Link to="/route/plan">
            <Button>Plan today's route</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <NavigationIcon className="h-5 w-5 text-primary" /> Live Route
          </h1>
          <p className="text-sm text-muted-foreground">
            {stops.filter((s) => s.checked_in).length} / {stops.length} stops complete
          </p>
        </div>
        <div className="flex gap-2">
          {allDone && plan.status !== "completed" && (
            <Button onClick={completeRoute} disabled={completing}>
              {completing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              <Flag className="h-4 w-4 mr-1" /> Complete Route & Log Mileage
            </Button>
          )}
          {plan.status === "completed" && (
            <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 gap-1">
              <CheckCircle2 className="h-3 w-3" /> Completed · {plan.actual_distance_km?.toFixed(1) ?? "—"} km
            </Badge>
          )}
        </div>
      </header>

      <Card className="p-3">
        <Suspense fallback={<div className="h-[320px] bg-muted rounded animate-pulse" />}>
          <RouteMap
            stops={
              pos
                ? [
                    ...mapStops,
                    { id: "_me", sequence: 0, lat: pos.lat, lng: pos.lng, label: "You", priority: "low" as const, color: "#0ea5e9" },
                  ]
                : mapStops
            }
            start={{
              lat: plan.start_latitude ?? DEFAULT_OFFICE.lat,
              lng: plan.start_longitude ?? DEFAULT_OFFICE.lng,
              label: plan.start_location ?? DEFAULT_OFFICE.label,
            }}
            height={340}
          />
        </Suspense>
      </Card>

      {nextStop && (
        <Card className="p-4 border-primary/40 bg-primary/5">
          <div className="text-xs uppercase tracking-wide text-primary font-semibold mb-1">Next stop</div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-lg">
                #{nextStop.sequence} {nextStop.customer_name}
              </div>
              <div className="text-sm text-muted-foreground flex items-center gap-3 mt-1">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {nextStop.area || "—"}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {nextStop.estimated_arrival_time
                    ? new Date(nextStop.estimated_arrival_time).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </span>
              </div>
              {nextStop.rationale && <p className="text-sm mt-2 italic">{nextStop.rationale}</p>}
            </div>
            {nextStop.latitude != null && nextStop.longitude != null && (
              <a href={googleMapsLink(nextStop.latitude, nextStop.longitude, nextStop.customer_name)} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline">
                  Navigate <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              </a>
            )}
          </div>
          <div className="mt-3">
            <Button onClick={() => checkIn(nextStop)} className="w-full">
              I'm here — Check in
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-3">
        <h3 className="font-semibold mb-2">All stops</h3>
        <ol className="space-y-2">
          {stops.map((s) => (
            <li
              key={s.id}
              className={`border rounded-lg p-3 flex items-center justify-between gap-3 ${
                s.checked_in ? "bg-emerald-500/5 border-emerald-500/30" : ""
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                    s.checked_in ? "bg-emerald-500" : ""
                  }`}
                  style={!s.checked_in ? { background: priorityColor(s.priority) } : undefined}
                >
                  {s.checked_in ? <CheckCircle2 className="h-4 w-4" /> : s.sequence}
                </div>
                <div className="min-w-0">
                  <div className="font-medium truncate">{s.customer_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.area || "—"} ·{" "}
                    {s.estimated_arrival_time
                      ? new Date(s.estimated_arrival_time).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}{" "}
                    · {s.planned_duration_minutes}m
                    {s.open_deal_value ? ` · ${bdt(s.open_deal_value)}` : ""}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={priorityBadgeClass(s.priority)}>
                  {s.priority}
                </Badge>
                {!s.checked_in && (
                  <Button size="sm" variant="ghost" onClick={() => checkIn(s)}>
                    Check in
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
        {plan.total_distance_km != null && (
          <p className="text-xs text-muted-foreground mt-3 text-center">
            Planned: {plan.total_distance_km.toFixed(1)} km ·{" "}
            {plan.total_minutes ? formatMinutes(plan.total_minutes) : "—"}
          </p>
        )}
      </Card>
    </div>
  );
}

function priorityColor(p: string) {
  if (p === "high") return "#ef4444";
  if (p === "medium") return "#f59e0b";
  return "#10b981";
}
