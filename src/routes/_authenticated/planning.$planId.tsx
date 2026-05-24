import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowDown, ArrowUp, Check, MapPin, Navigation, Plus, Trash2, Play, CheckCircle2, X,
} from "lucide-react";
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  PLAN_STATUS_META, STOP_STATUS_META, mapsLink,
  type PlanStatus, type RoutePlan, type RouteStop,
} from "@/lib/planning/types";

export const Route = createFileRoute("/_authenticated/planning/$planId")({
  component: PlanDetail,
});

function PlanDetail() {
  const { planId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const plan = useQuery({
    queryKey: ["plan", planId],
    queryFn: async () => {
      const { data, error } = await supabase.from("route_plans").select("*").eq("id", planId).maybeSingle();
      if (error) throw error;
      return data as RoutePlan | null;
    },
  });

  const stops = useQuery({
    queryKey: ["plan-stops", planId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_plan_stops")
        .select("*")
        .eq("plan_id", planId)
        .order("sequence");
      if (error) throw error;
      return (data ?? []) as RouteStop[];
    },
  });

  const setStatus = useMutation({
    mutationFn: async (status: PlanStatus) => {
      const { error } = await supabase.from("route_plans").update({ status }).eq("id", planId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plan", planId] }),
  });

  const delPlan = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("route_plans").delete().eq("id", planId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Plan deleted"); navigate({ to: "/planning" }); },
    onError: (e: any) => toast.error(e.message),
  });

  const swap = useMutation({
    mutationFn: async ({ id, other }: { id: string; other: string }) => {
      const a = (stops.data ?? []).find((s) => s.id === id);
      const b = (stops.data ?? []).find((s) => s.id === other);
      if (!a || !b) return;
      await supabase.from("route_plan_stops").update({ sequence: b.sequence }).eq("id", a.id);
      await supabase.from("route_plan_stops").update({ sequence: a.sequence }).eq("id", b.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plan-stops", planId] }),
  });

  const updateStop = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<RouteStop> }) => {
      const { error } = await supabase.from("route_plan_stops").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plan-stops", planId] }),
  });

  const delStop = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("route_plan_stops").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plan-stops", planId] }),
  });

  const convertToVisit = useMutation({
    mutationFn: async (stop: RouteStop) => {
      if (!user || !plan.data) throw new Error("Missing context");
      const { data, error } = await supabase
        .from("customer_visits")
        .insert({
          user_id: user.id,
          company_id: plan.data.company_id,
          customer_name: stop.customer_name,
          location: stop.address || stop.location_name,
          meeting_at: new Date().toISOString(),
          status: "completed",
          contact_type: "customer",
        })
        .select("id")
        .single();
      if (error) throw error;
      await supabase.from("route_plan_stops").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        actual_visit_id: data.id,
      }).eq("id", stop.id);
      return data.id as string;
    },
    onSuccess: () => {
      toast.success("Visit logged & stop completed");
      qc.invalidateQueries({ queryKey: ["plan-stops", planId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (plan.isLoading) return <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>;
  if (!plan.data) return <Card className="p-6 text-sm text-muted-foreground">Plan not found.</Card>;

  const p = plan.data;
  const meta = PLAN_STATUS_META[p.status];
  const sorted = stops.data ?? [];
  const doneCount = sorted.filter((s) => s.status === "completed").length;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">{format(parseISO(p.plan_date), "EEEE, dd MMM yyyy")}</div>
            <h2 className="text-xl font-semibold">{p.title || "Untitled plan"}</h2>
            <div className="mt-1 text-sm text-muted-foreground">
              {p.territory && <span>Territory: {p.territory}</span>}
              {p.start_location && <span> · Start: {p.start_location}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={meta.tone} variant="outline">{meta.label}</Badge>
            <Select value={p.status} onValueChange={(v) => setStatus.mutate(v as PlanStatus)}>
              <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(PLAN_STATUS_META) as PlanStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{PLAN_STATUS_META[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => delPlan.mutate()}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
        {p.notes && <p className="mt-3 whitespace-pre-wrap text-sm">{p.notes}</p>}
        <div className="mt-3 text-xs text-muted-foreground">{doneCount}/{sorted.length} stops completed</div>
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Stops</h3>
        <AddStopDialog planId={planId} nextSeq={sorted.length} onAdded={() => qc.invalidateQueries({ queryKey: ["plan-stops", planId] })} />
      </div>

      {sorted.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No stops yet — add the first one.</Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((s, i) => {
            const stopMeta = STOP_STATUS_META[s.status];
            const link = mapsLink(s.latitude, s.longitude, s.address);
            return (
              <Card key={s.id} className="p-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">{s.customer_name}</div>
                      <Badge className={stopMeta.tone} variant="outline">{stopMeta.label}</Badge>
                      {s.planned_arrival && <span className="text-xs text-muted-foreground">@ {s.planned_arrival.slice(0,5)}</span>}
                      {s.planned_duration_minutes != null && <span className="text-xs text-muted-foreground">· {s.planned_duration_minutes}m</span>}
                    </div>
                    {(s.location_name || s.address) && (
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        <MapPin className="mr-1 inline h-3 w-3" />
                        {s.location_name}{s.location_name && s.address ? " · " : ""}{s.address}
                      </div>
                    )}
                    {s.notes && <div className="mt-1 text-xs">{s.notes}</div>}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {link && (
                        <Button asChild size="sm" variant="outline">
                          <a href={link} target="_blank" rel="noreferrer"><Navigation className="mr-1 h-3.5 w-3.5" /> Navigate</a>
                        </Button>
                      )}
                      {s.status === "pending" && (
                        <Button size="sm" variant="outline" onClick={() => updateStop.mutate({ id: s.id, patch: { status: "arrived", arrived_at: new Date().toISOString() } })}>
                          <Play className="mr-1 h-3.5 w-3.5" /> Arrived
                        </Button>
                      )}
                      {s.status !== "completed" && s.status !== "skipped" && (
                        <Button size="sm" onClick={() => convertToVisit.mutate(s)} disabled={convertToVisit.isPending}>
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Log visit & complete
                        </Button>
                      )}
                      {s.status === "pending" && (
                        <Button size="sm" variant="ghost" onClick={() => updateStop.mutate({ id: s.id, patch: { status: "skipped" } })}>
                          <X className="mr-1 h-3.5 w-3.5" /> Skip
                        </Button>
                      )}
                      {s.actual_visit_id && (
                        <Button asChild size="sm" variant="ghost">
                          <Link to="/visits">View visit</Link>
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button size="icon" variant="ghost" disabled={i === 0} onClick={() => swap.mutate({ id: s.id, other: sorted[i - 1].id })}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" disabled={i === sorted.length - 1} onClick={() => swap.mutate({ id: s.id, other: sorted[i + 1].id })}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => delStop.mutate(s.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddStopDialog({ planId, nextSeq, onAdded }: { planId: string; nextSeq: number; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [address, setAddress] = useState("");
  const [arrival, setArrival] = useState("");
  const [duration, setDuration] = useState("30");
  const [leadId, setLeadId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const leads = useQuery({
    queryKey: ["plan-add-leads"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_leads")
        .select("id, customer_name, company, location, address")
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const pickLead = (id: string) => {
    setLeadId(id);
    const l = (leads.data ?? []).find((x: any) => x.id === id);
    if (l) {
      setCustomerName(l.customer_name || "");
      setLocationName(l.company || "");
      setAddress(l.address || l.location || "");
    }
  };

  const submit = async () => {
    if (!customerName.trim()) return toast.error("Customer name required");
    setBusy(true);
    try {
      const { error } = await supabase.from("route_plan_stops").insert({
        plan_id: planId,
        sequence: nextSeq,
        lead_id: leadId || null,
        customer_name: customerName.trim(),
        location_name: locationName || null,
        address: address || null,
        planned_arrival: arrival || null,
        planned_duration_minutes: duration ? Number(duration) : null,
        notes: notes || null,
      });
      if (error) throw error;
      toast.success("Stop added");
      setOpen(false);
      setCustomerName(""); setLocationName(""); setAddress(""); setArrival(""); setDuration("30"); setLeadId(""); setNotes("");
      onAdded();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Add stop</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add stop</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          {(leads.data ?? []).length > 0 && (
            <div>
              <Label>From existing lead (optional)</Label>
              <Select value={leadId} onValueChange={pickLead}>
                <SelectTrigger><SelectValue placeholder="Pick a lead to prefill" /></SelectTrigger>
                <SelectContent>
                  {leads.data!.map((l: any) => (
                    <SelectItem key={l.id} value={l.id}>{l.customer_name}{l.company ? ` — ${l.company}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Customer name *</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Location name</Label>
              <Input value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="Company / site" />
            </div>
            <div>
              <Label>Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Planned arrival</Label>
              <Input type="time" value={arrival} onChange={(e) => setArrival(e.target.value)} />
            </div>
            <div>
              <Label>Duration (min)</Label>
              <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}><Check className="mr-1 h-4 w-4" /> Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
