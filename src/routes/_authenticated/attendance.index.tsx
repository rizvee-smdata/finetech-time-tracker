import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { LogIn, LogOut, MapPin, Clock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  distanceMeters, getCurrentPosition, reverseGeocode, statusFromCheckIn,
  STATUS_META, type AttendanceRecord, type AttendanceSettings,
} from "@/lib/attendance/types";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/attendance/")({
  component: AttendanceTodayPage,
});

function todayInDhaka(): string {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }))
    .toISOString().slice(0, 10);
}

function AttendanceTodayPage() {
  const { user, companyId } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<"in" | "out" | null>(null);
  const [notes, setNotes] = useState("");
  const today = todayInDhaka();

  const settings = useQuery({
    queryKey: ["attendance-settings", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<AttendanceSettings | null> => {
      const { data } = await sb.from("attendance_settings").select("*").eq("company_id", companyId).maybeSingle();
      return data ?? null;
    },
  });

  const todayRec = useQuery({
    queryKey: ["attendance-today", user?.id, today],
    enabled: !!user,
    queryFn: async (): Promise<AttendanceRecord | null> => {
      const { data } = await sb.from("attendance_records").select("*")
        .eq("user_id", user!.id).eq("work_date", today).maybeSingle();
      return data ?? null;
    },
  });

  async function captureLocation() {
    const pos = await getCurrentPosition();
    const address = await reverseGeocode(pos.lat, pos.lng);
    const s = settings.data;
    let distance: number | null = null;
    let withinFence: boolean | null = null;
    if (s?.geofence_lat != null && s?.geofence_lng != null && s?.geofence_radius_m) {
      distance = distanceMeters(pos.lat, pos.lng, s.geofence_lat, s.geofence_lng);
      withinFence = distance <= s.geofence_radius_m;
      if (s.geofence_required && !withinFence) {
        throw new Error(`You're ${distance}m from the office (allowed: ${s.geofence_radius_m}m). Move closer to check in.`);
      }
    }
    return { pos, address, distance, withinFence };
  }

  async function checkIn() {
    if (!companyId || !user) { toast.error("Select a company first"); return; }
    setBusy("in");
    try {
      const { pos, address, distance, withinFence } = await captureLocation();
      const now = new Date();
      const s = settings.data;
      const status = s ? statusFromCheckIn(now, s.work_start_time, s.late_threshold_minutes) : "present";
      const { error } = await sb.from("attendance_records").insert({
        company_id: companyId, user_id: user.id, work_date: today, status,
        check_in_at: now.toISOString(),
        check_in_lat: pos.lat, check_in_lng: pos.lng, check_in_address: address,
        check_in_distance_m: distance, check_in_within_geofence: withinFence,
        notes: notes || null,
      });
      if (error) throw error;
      toast.success(status === "late" ? "Checked in (marked late)" : "Checked in");
      qc.invalidateQueries({ queryKey: ["attendance-today"] });
      setNotes("");
    } catch (e: any) {
      toast.error(e.message ?? "Check-in failed");
    } finally { setBusy(null); }
  }

  async function checkOut() {
    if (!todayRec.data) return;
    setBusy("out");
    try {
      const { pos, address, distance, withinFence } = await captureLocation();
      const { error } = await sb.from("attendance_records").update({
        check_out_at: new Date().toISOString(),
        check_out_lat: pos.lat, check_out_lng: pos.lng, check_out_address: address,
        check_out_distance_m: distance, check_out_within_geofence: withinFence,
      }).eq("id", todayRec.data.id);
      if (error) throw error;
      toast.success("Checked out");
      qc.invalidateQueries({ queryKey: ["attendance-today"] });
    } catch (e: any) {
      toast.error(e.message ?? "Check-out failed");
    } finally { setBusy(null); }
  }

  const rec = todayRec.data;
  const isCheckedIn = !!rec?.check_in_at;
  const isCheckedOut = !!rec?.check_out_at;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{format(new Date(), "EEEE, MMM d")}</div>
            <div className="text-lg font-semibold">
              {!isCheckedIn ? "Not checked in" : isCheckedOut ? "Day complete" : "On the clock"}
            </div>
          </div>
          {rec && <Badge className={STATUS_META[rec.status].cls + " text-[10px]"}>{STATUS_META[rec.status].label}</Badge>}
        </div>

        {rec && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-md border p-3 text-sm">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <LogIn className="h-3.5 w-3.5" /> Checked in
              </div>
              <div className="font-semibold">{rec.check_in_at ? format(new Date(rec.check_in_at), "p") : "—"}</div>
              {rec.check_in_address && <div className="mt-1 flex items-start gap-1 text-xs text-muted-foreground"><MapPin className="mt-0.5 h-3 w-3 shrink-0" />{rec.check_in_address}</div>}
              {rec.check_in_distance_m != null && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {rec.check_in_within_geofence === false && <AlertTriangle className="mr-1 inline h-3 w-3 text-amber-500" />}
                  {rec.check_in_distance_m}m from office
                </div>
              )}
            </div>
            <div className="rounded-md border p-3 text-sm">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <LogOut className="h-3.5 w-3.5" /> Checked out
              </div>
              <div className="font-semibold">{rec.check_out_at ? format(new Date(rec.check_out_at), "p") : "—"}</div>
              {rec.check_out_address && <div className="mt-1 flex items-start gap-1 text-xs text-muted-foreground"><MapPin className="mt-0.5 h-3 w-3 shrink-0" />{rec.check_out_address}</div>}
              {rec.total_minutes != null && (
                <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" /> {Math.floor(rec.total_minutes / 60)}h {rec.total_minutes % 60}m worked
                </div>
              )}
            </div>
          </div>
        )}

        {!isCheckedIn && (
          <div className="mt-3 space-y-2">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. WFH, field visit" />
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {!isCheckedIn && (
            <Button size="lg" onClick={checkIn} disabled={busy !== null}>
              <LogIn className="mr-2 h-4 w-4" />{busy === "in" ? "Capturing GPS…" : "Check in"}
            </Button>
          )}
          {isCheckedIn && !isCheckedOut && (
            <Button size="lg" variant="secondary" onClick={checkOut} disabled={busy !== null}>
              <LogOut className="mr-2 h-4 w-4" />{busy === "out" ? "Capturing GPS…" : "Check out"}
            </Button>
          )}
        </div>
      </Card>

      {settings.data && (
        <div className="text-xs text-muted-foreground">
          Shift: {settings.data.work_start_time.slice(0, 5)} – {settings.data.work_end_time.slice(0, 5)} · Late after {settings.data.late_threshold_minutes}m
          {settings.data.geofence_required && settings.data.geofence_radius_m && (
            <> · Geofence required (within {settings.data.geofence_radius_m}m)</>
          )}
        </div>
      )}
    </div>
  );
}
