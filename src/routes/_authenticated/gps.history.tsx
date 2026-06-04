import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { MapView, type MapPoint } from "@/components/gps/MapView";
import { format } from "date-fns";
import { CheckCircle2, AlertTriangle, MapPin } from "lucide-react";

export const Route = createFileRoute("/_authenticated/gps/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const { user } = useAuth();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const dateStr = date ? format(date, "yyyy-MM-dd") : null;

  const { data: checkins = [] } = useQuery({
    queryKey: ["history-checkins", user?.id, dateStr],
    enabled: !!user && !!dateStr,
    queryFn: async () => {
      const from = `${dateStr}T00:00:00`;
      const to = `${dateStr}T23:59:59`;
      const { data } = await supabase.from("visit_checkins").select("*")
        .eq("user_id", user!.id)
        .gte("checkin_time", from).lte("checkin_time", to)
        .order("checkin_time");
      return data ?? [];
    },
  });

  const { data: route } = useQuery({
    queryKey: ["history-route", user?.id, dateStr],
    enabled: !!user && !!dateStr,
    queryFn: async () => {
      const { data } = await supabase.from("daily_routes").select("*")
        .eq("user_id", user!.id).eq("route_date", dateStr!).maybeSingle();
      return data;
    },
  });

  const points: MapPoint[] = checkins.map((c, i) => ({
    lat: c.checkin_lat, lng: c.checkin_lng,
    label: String(i + 1),
    title: c.client_name ?? "Check-in",
    color: c.is_geofence_valid ? "#10b981" : "#f59e0b",
  }));
  const path = checkins.map((c) => ({ lat: c.checkin_lat, lng: c.checkin_lng }));

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-2 md:p-0">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Route history</h1>
        <p className="text-sm text-muted-foreground">Review past visits and mileage.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-[auto_1fr]">
        <Card className="p-2">
          <Calendar mode="single" selected={date} onSelect={setDate} />
        </Card>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-3"><div className="text-xs text-muted-foreground">Date</div><div className="text-base font-semibold">{dateStr}</div></Card>
            <Card className="p-3"><div className="text-xs text-muted-foreground">Visits</div><div className="text-xl font-semibold">{route?.visit_count ?? checkins.length}</div></Card>
            <Card className="p-3"><div className="text-xs text-muted-foreground">Km driven</div><div className="text-xl font-semibold">{(route?.total_km ?? 0).toFixed(1)}</div></Card>
          </div>

          {checkins.length > 0 ? (
            <MapView points={points} path={path} height={300} />
          ) : (
            <Card className="p-6 text-center text-sm text-muted-foreground">No check-ins on this day.</Card>
          )}

          <div className="space-y-2">
            {checkins.map((c, i) => (
              <Card key={c.id} className="flex items-start gap-3 p-3">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">{i + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate font-medium">{c.client_name ?? "Client"}</div>
                    {c.is_geofence_valid
                      ? <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" />On-site</Badge>
                      : <Badge variant="outline" className="gap-1 border-warning text-warning"><AlertTriangle className="h-3 w-3" />Override</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(c.checkin_time), "p")}
                    {c.checkout_time ? ` → ${format(new Date(c.checkout_time), "p")}` : " · ongoing"}
                    {c.distance_from_client_m != null ? ` · ${Math.round(c.distance_from_client_m)} m` : ""}
                  </div>
                  {c.notes && <div className="mt-1 text-sm">{c.notes}</div>}
                  {c.selfie_url && <SelfieThumb path={c.selfie_url} />}
                </div>
                <MapPin className="h-4 w-4 text-muted-foreground" />
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SelfieThumb({ path }: { path: string }) {
  const { data } = useQuery({
    queryKey: ["selfie", path],
    queryFn: async () => {
      const { data } = await supabase.storage.from("checkins-media").createSignedUrl(path, 600);
      return data?.signedUrl ?? null;
    },
  });
  if (!data) return null;
  return <img src={data} alt="selfie" className="mt-2 h-20 w-20 rounded object-cover" />;
}
