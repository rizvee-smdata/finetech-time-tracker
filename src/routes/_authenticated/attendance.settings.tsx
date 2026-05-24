import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { MapPin } from "lucide-react";
import { getCurrentPosition, type AttendanceSettings } from "@/lib/attendance/types";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/attendance/settings")({
  component: AttendanceSettingsPage,
});

function AttendanceSettingsPage() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<AttendanceSettings>>({});
  const [saving, setSaving] = useState(false);

  const settings = useQuery({
    queryKey: ["attendance-settings", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<AttendanceSettings | null> => {
      const { data } = await sb.from("attendance_settings").select("*").eq("company_id", companyId).maybeSingle();
      return data ?? null;
    },
  });

  useEffect(() => {
    if (settings.data) setForm(settings.data);
    else if (!settings.isLoading) {
      setForm({
        work_start_time: "09:00", work_end_time: "18:00",
        late_threshold_minutes: 15, half_day_after_minutes: 120,
        geofence_required: false,
      });
    }
  }, [settings.data, settings.isLoading]);

  async function captureOffice() {
    try {
      const pos = await getCurrentPosition();
      setForm({ ...form, geofence_lat: pos.lat, geofence_lng: pos.lng });
      toast.success("Office location captured");
    } catch (e: any) { toast.error(e.message); }
  }

  async function save() {
    if (!companyId) return;
    setSaving(true);
    try {
      const payload = { ...form, company_id: companyId };
      const { error } = await sb.from("attendance_settings").upsert(payload, { onConflict: "company_id" });
      if (error) throw error;
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["attendance-settings", companyId] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally { setSaving(false); }
  }

  const f = form;

  return (
    <Card className="max-w-2xl p-5 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Shift start</Label>
          <Input type="time" value={(f.work_start_time ?? "09:00").slice(0, 5)} onChange={(e) => setForm({ ...f, work_start_time: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Shift end</Label>
          <Input type="time" value={(f.work_end_time ?? "18:00").slice(0, 5)} onChange={(e) => setForm({ ...f, work_end_time: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Late after (minutes)</Label>
          <Input type="number" min={0} value={f.late_threshold_minutes ?? 15} onChange={(e) => setForm({ ...f, late_threshold_minutes: Number(e.target.value) })} />
        </div>
        <div className="space-y-1">
          <Label>Half-day if late by (minutes)</Label>
          <Input type="number" min={0} value={f.half_day_after_minutes ?? 120} onChange={(e) => setForm({ ...f, half_day_after_minutes: Number(e.target.value) })} />
        </div>
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <div className="flex items-center justify-between">
          <div>
            <Label>Require check-in inside geofence</Label>
            <p className="text-xs text-muted-foreground">Block check-in if rep is outside the radius below.</p>
          </div>
          <Switch checked={!!f.geofence_required} onCheckedChange={(v) => setForm({ ...f, geofence_required: v })} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Office latitude</Label>
            <Input type="number" step="0.000001" value={f.geofence_lat ?? ""} onChange={(e) => setForm({ ...f, geofence_lat: e.target.value ? Number(e.target.value) : null })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Office longitude</Label>
            <Input type="number" step="0.000001" value={f.geofence_lng ?? ""} onChange={(e) => setForm({ ...f, geofence_lng: e.target.value ? Number(e.target.value) : null })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Radius (m)</Label>
            <Input type="number" min={10} value={f.geofence_radius_m ?? ""} onChange={(e) => setForm({ ...f, geofence_radius_m: e.target.value ? Number(e.target.value) : null })} />
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={captureOffice}>
          <MapPin className="mr-1.5 h-4 w-4" />Use my current location
        </Button>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button>
      </div>
    </Card>
  );
}
