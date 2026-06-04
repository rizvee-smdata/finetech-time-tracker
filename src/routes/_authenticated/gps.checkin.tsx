import { createFileRoute, useSearch, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Camera, Mic, Square, CheckCircle2, AlertTriangle, WifiOff, LogOut } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { haversineMeters } from "@/lib/maps/haversine";

const GEOFENCE_M = 200;

export const Route = createFileRoute("/_authenticated/gps/checkin")({
  validateSearch: (s: Record<string, unknown>) => ({ leadId: typeof s.leadId === "string" ? s.leadId : undefined }),
  component: CheckinPage,
});

function CheckinPage() {
  const { user, companyId } = useAuth();
  const qc = useQueryClient();
  const { leadId: initialLeadId } = useSearch({ from: "/_authenticated/gps/checkin" });
  const [leadId, setLeadId] = useState<string | undefined>(initialLeadId);
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [posError, setPosError] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [recording, setRecording] = useState(false);
  const [override, setOverride] = useState("");
  const [notes, setNotes] = useState("");
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) { setPosError("Geolocation not supported on this device"); return; }
    const watch = navigator.geolocation.watchPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }); setPosError(null); },
      (e) => setPosError(e.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  const { data: leads = [] } = useQuery({
    queryKey: ["checkin-leads", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("crm_leads")
        .select("id, customer_name, address_lat, address_lng, address_text")
        .eq("company_id", companyId!)
        .not("address_lat", "is", null)
        .order("customer_name");
      return data ?? [];
    },
  });

  const lead = leads.find((l) => l.id === leadId);

  const { data: openCheckin } = useQuery({
    queryKey: ["open-checkin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("visit_checkins").select("*")
        .eq("user_id", user!.id).is("checkout_time", null)
        .order("checkin_time", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
  });

  const distance = lead?.address_lat != null && pos
    ? haversineMeters(pos, { lat: Number(lead.address_lat), lng: Number(lead.address_lng) })
    : null;
  const withinFence = distance != null ? distance <= GEOFENCE_M : null;

  async function uploadMedia(blob: Blob | File, ext: string): Promise<string | null> {
    if (!user) return null;
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("checkins-media").upload(path, blob, { contentType: blob.type || undefined });
    if (error) { toast.error(error.message); return null; }
    return path;
  }

  const checkInMut = useMutation({
    mutationFn: async () => {
      if (!user || !companyId) throw new Error("Not ready");
      if (!pos) throw new Error("Waiting for GPS");
      if (!lead) throw new Error("Pick a client");
      if (withinFence === false && !override.trim()) {
        throw new Error(`You are ${Math.round(distance!)} m away — provide an override reason or move closer.`);
      }
      const selfie_url = selfie ? await uploadMedia(selfie, selfie.name.split(".").pop() || "jpg") : null;
      const voice_url = voiceBlob ? await uploadMedia(voiceBlob, "webm") : null;
      const { error } = await supabase.from("visit_checkins").insert({
        user_id: user.id, company_id: companyId, lead_id: lead.id, client_name: lead.customer_name,
        checkin_lat: pos.lat, checkin_lng: pos.lng,
        distance_from_client_m: distance, is_geofence_valid: !!withinFence,
        override_reason: override || null, selfie_url, voice_url, notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Checked in");
      setSelfie(null); setVoiceBlob(null); setOverride(""); setNotes("");
      qc.invalidateQueries({ queryKey: ["open-checkin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const checkOutMut = useMutation({
    mutationFn: async () => {
      if (!openCheckin || !pos) throw new Error("No active check-in or GPS");
      const { error } = await supabase.from("visit_checkins").update({
        checkout_time: new Date().toISOString(),
        checkout_lat: pos.lat, checkout_lng: pos.lng,
      }).eq("id", openCheckin.id);
      if (error) throw error;
      // Fire-and-forget mileage compute
      try {
        await supabase.functions.invoke("compute-mileage", { body: { date: format(new Date(), "yyyy-MM-dd") } });
      } catch {}
    },
    onSuccess: () => { toast.success("Checked out"); qc.invalidateQueries({ queryKey: ["open-checkin"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = () => {
        setVoiceBlob(new Blob(chunksRef.current, { type: "audio/webm" }));
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch (e: any) { toast.error(e.message); }
  }
  function stopRec() { mediaRef.current?.stop(); setRecording(false); }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-2 md:p-0">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Check in</h1>
        <p className="text-sm text-muted-foreground">Verify your location at the client site.</p>
      </div>

      {!online && (
        <Card className="flex items-center gap-2 border-warning bg-warning/10 p-3 text-sm">
          <WifiOff className="h-4 w-4" />Offline — connect to submit your check-in.
        </Card>
      )}

      {openCheckin ? (
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Currently checked in at</div>
              <div className="text-lg font-semibold">{openCheckin.client_name ?? "Client"}</div>
              <div className="text-xs text-muted-foreground">since {format(new Date(openCheckin.checkin_time), "p")}</div>
            </div>
            <Badge variant={openCheckin.is_geofence_valid ? "default" : "secondary"}>
              {openCheckin.is_geofence_valid ? "On-site" : "Override"}
            </Badge>
          </div>
          <Button className="w-full" size="lg" onClick={() => checkOutMut.mutate()} disabled={!pos || checkOutMut.isPending}>
            <LogOut className="mr-2 h-4 w-4" />Check out
          </Button>
        </Card>
      ) : (
        <Card className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label>Client</Label>
            <Select value={leadId ?? ""} onValueChange={(v) => setLeadId(v)}>
              <SelectTrigger><SelectValue placeholder="Select a client with a saved address" /></SelectTrigger>
              <SelectContent>
                {leads.map((l) => <SelectItem key={l.id} value={l.id}>{l.customer_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium"><MapPin className="h-4 w-4" />Your location</div>
            {posError && <p className="mt-1 text-destructive">{posError}. Please grant location permission.</p>}
            {!pos && !posError && <p className="mt-1 text-muted-foreground">Acquiring GPS…</p>}
            {pos && (
              <p className="mt-1 text-muted-foreground">
                {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)} · ±{Math.round(pos.accuracy)} m
              </p>
            )}
            {distance != null && (
              <div className={`mt-2 flex items-center gap-2 font-medium ${withinFence ? "text-success" : "text-warning"}`}>
                {withinFence ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                {Math.round(distance)} m from client {withinFence ? "(within 200 m)" : "(outside 200 m)"}
              </div>
            )}
          </div>

          {withinFence === false && (
            <div className="space-y-1.5">
              <Label>Override reason (manager approval flag)</Label>
              <Textarea value={override} onChange={(e) => setOverride(e.target.value)} placeholder="e.g. meeting moved to nearby café" rows={2} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <label className="cursor-pointer">
              <Input type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => setSelfie(e.target.files?.[0] ?? null)} />
              <Button asChild variant="outline" className="w-full" type="button">
                <span><Camera className="mr-2 h-4 w-4" />{selfie ? "Photo ✓" : "Selfie"}</span>
              </Button>
            </label>
            {recording ? (
              <Button variant="outline" onClick={stopRec}><Square className="mr-2 h-4 w-4" />Stop ({voiceBlob ? "re-record" : "recording"})</Button>
            ) : (
              <Button variant="outline" onClick={startRec}><Mic className="mr-2 h-4 w-4" />{voiceBlob ? "Voice ✓" : "Voice note"}</Button>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <Button size="lg" className="h-14 w-full text-base" onClick={() => checkInMut.mutate()} disabled={!pos || !lead || !online || checkInMut.isPending}>
            <CheckCircle2 className="mr-2 h-5 w-5" />CHECK IN
          </Button>
        </Card>
      )}

      <div className="text-center text-xs text-muted-foreground">
        <Link to="/gps/today" className="underline">Today's route</Link> · <Link to="/gps/history" className="underline">History</Link>
      </div>
    </div>
  );
}
