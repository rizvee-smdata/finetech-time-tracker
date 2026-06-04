import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapView, type MapPoint } from "@/components/gps/MapView";
import { haversineMeters, nearestNeighborOrder } from "@/lib/maps/haversine";
import { MapPin, Navigation, Clock, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/gps/today")({
  component: RouteToday,
});

interface Stop {
  task_id: string;
  title: string;
  scheduled_time: string | null;
  lead_id: string | null;
  client_name: string;
  lat: number;
  lng: number;
  address?: string | null;
}

function RouteToday() {
  const { user, companyId } = useAuth();
  const today = format(new Date(), "yyyy-MM-dd");
  const [start, setStart] = useState<{ lat: number; lng: number } | null>(null);
  const [order, setOrder] = useState<string[] | null>(null);

  const { data: stops = [], isLoading } = useQuery({
    queryKey: ["gps-today-stops", user?.id, today],
    enabled: !!user && !!companyId,
    queryFn: async () => {
      const { data: tasks, error } = await supabase
        .from("tms_tasks")
        .select("id, title, scheduled_time, lead_id, category, scheduled_date")
        .eq("company_id", companyId!)
        .eq("created_by", user!.id)
        .eq("scheduled_date", today)
        .ilike("category", "%client visit%")
        .is("deleted_at", null);
      if (error) throw error;
      const leadIds = (tasks ?? []).map((t) => t.lead_id).filter(Boolean) as string[];
      const leadMap = new Map<string, any>();
      if (leadIds.length) {
        const { data: leads } = await supabase
          .from("crm_leads")
          .select("id, customer_name, address_lat, address_lng, address_text, location")
          .in("id", leadIds);
        (leads ?? []).forEach((l) => leadMap.set(l.id, l));
      }
      const out: Stop[] = [];
      for (const t of tasks ?? []) {
        const lead = t.lead_id ? leadMap.get(t.lead_id) : null;
        if (!lead || lead.address_lat == null || lead.address_lng == null) continue;
        out.push({
          task_id: t.id,
          title: t.title,
          scheduled_time: t.scheduled_time,
          lead_id: t.lead_id,
          client_name: lead.customer_name,
          lat: Number(lead.address_lat),
          lng: Number(lead.address_lng),
          address: lead.address_text ?? lead.location,
        });
      }
      return out;
    },
  });

  const ordered = useMemo(() => {
    if (!order) return stops;
    const map = new Map(stops.map((s) => [s.task_id, s] as const));
    return order.map((id) => map.get(id)!).filter(Boolean);
  }, [stops, order]);

  const points: MapPoint[] = ordered.map((s, i) => ({
    lat: s.lat, lng: s.lng, label: String(i + 1), title: s.client_name,
  }));
  const path = ordered.map((s) => ({ lat: s.lat, lng: s.lng }));

  const totalKm = useMemo(() => {
    let m = 0;
    for (let i = 1; i < ordered.length; i++) m += haversineMeters(ordered[i - 1], ordered[i]);
    return m / 1000;
  }, [ordered]);
  // Rough ETA: 30 km/h urban average
  const etaMin = Math.round((totalKm / 30) * 60);

  function reorderByProximity() {
    if (!stops.length) return;
    const startFrom: Stop = start
      ? { ...stops[0], lat: start.lat, lng: start.lng }
      : stops[0];
    const rest = start ? stops : stops.slice(1);
    const ord = nearestNeighborOrder(startFrom, rest);
    setOrder(ord.map((s) => s.task_id));
    toast.success("Route optimized by proximity");
  }

  function useMyLocation() {
    if (!navigator.geolocation) return toast.error("Geolocation not supported");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStart({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        toast.success("Starting from your location");
      },
      (e) => toast.error(e.message),
      { enableHighAccuracy: true },
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-2 md:p-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today's route</h1>
          <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE, d MMM yyyy")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={useMyLocation}><MapPin className="mr-1 h-4 w-4" />My location</Button>
          <Button size="sm" onClick={reorderByProximity} disabled={!stops.length}><Navigation className="mr-1 h-4 w-4" />Optimize</Button>
          <Link to="/gps/checkin"><Button size="sm" variant="secondary">Check in</Button></Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3"><div className="text-xs text-muted-foreground">Stops</div><div className="text-xl font-semibold">{ordered.length}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Distance</div><div className="text-xl font-semibold">{totalKm.toFixed(1)} km</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Est. driving</div><div className="text-xl font-semibold">{etaMin} min</div></Card>
      </div>

      {ordered.length > 0 ? (
        <MapView points={points} path={path} height={360} />
      ) : (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {isLoading ? "Loading…" : "No client-visit tasks for today (with geocoded address). Add visits in Today's tasks and set client coordinates in CRM."}
        </Card>
      )}

      <div className="space-y-2">
        {ordered.map((s, i) => (
          <Card key={s.task_id} className="flex items-center gap-3 p-3">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">{i + 1}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{s.client_name}</div>
              <div className="truncate text-xs text-muted-foreground">{s.title}{s.address ? ` · ${s.address}` : ""}</div>
            </div>
            {s.scheduled_time && (
              <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />{s.scheduled_time.slice(0, 5)}</Badge>
            )}
            <Link to="/gps/checkin" search={{ leadId: s.lead_id ?? undefined } as any}><ArrowRight className="h-4 w-4 text-muted-foreground" /></Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
