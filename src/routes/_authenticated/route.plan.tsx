import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sparkles,
  Search,
  Plus,
  X,
  GripVertical,
  Navigation as NavIcon,
  MapPin,
  Clock,
  TrendingUp,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_OFFICE,
  VISIT_DURATIONS,
  DHAKA_AREAS,
  type RouteStopCandidate,
  type StopPriority,
  type VisitType,
  type RouteStopRow,
} from "@/lib/routePlanner/types";
import {
  bdt,
  detectArea,
  formatMinutes,
  googleMapsLink,
  haversineKm,
  priorityBadgeClass,
  workingDayNumber,
} from "@/lib/routePlanner/utils";
import {
  confirmPlanAndMaterializeTasks,
  ensurePlan,
  getPlanStops,
  getTodayPlan,
  replaceStops,
  updatePlan,
} from "@/lib/routePlanner/api";
import { optimizeRoute } from "@/lib/routePlanner/optimize.functions";
import { suggestNearby, type NearbySuggestion } from "@/lib/routePlanner/suggestNearby.functions";

const RouteMap = lazy(() => import("@/components/route/RouteMap").then((m) => ({ default: m.RouteMap })));

export const Route = createFileRoute("/_authenticated/route/plan")({
  component: RoutePlanPage,
});

interface ClientPick {
  candidate: RouteStopCandidate;
}

function RoutePlanPage() {
  const { user, companyId } = useAuth();
  const qc = useQueryClient();
  const today = useMemo(() => new Date(), []);
  const dateIso = today.toISOString().slice(0, 10);

  const [picks, setPicks] = useState<ClientPick[]>([]);
  const [search, setSearch] = useState("");
  const [optimizing, setOptimizing] = useState(false);
  const [revealKey, setRevealKey] = useState(0);

  // Load active plan + stops
  const { data: plan } = useQuery({
    queryKey: ["route-plan", user?.id, dateIso],
    enabled: !!user?.id,
    queryFn: () => getTodayPlan(user!.id, dateIso),
  });

  const { data: savedStops } = useQuery({
    queryKey: ["route-plan-stops", plan?.id],
    enabled: !!plan?.id,
    queryFn: () => getPlanStops(plan!.id),
  });

  // Hydrate picks from saved stops on first load
  useEffect(() => {
    if (savedStops && savedStops.length && picks.length === 0) {
      setPicks(
        savedStops.map((s) => ({
          candidate: {
            client_id: s.lead_id || s.id,
            lead_id: s.lead_id,
            account_id: s.account_id,
            client_name: s.customer_name,
            area: s.area,
            lat: s.latitude,
            lng: s.longitude,
            priority: s.priority,
            visit_type: s.visit_type,
            open_deal_value: s.open_deal_value,
            days_since_last_visit: s.days_since_last_visit,
          },
        })),
      );
    }
  }, [savedStops, picks.length]);

  // Client search
  const { data: searchResults = [] } = useQuery({
    queryKey: ["client-search", companyId, search],
    enabled: !!companyId && search.length >= 1,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("crm_leads")
        .select("id, customer_name, company_name, location, address_lat, address_lng, expected_value, priority, last_activity_at")
        .eq("company_id", companyId)
        .ilike("customer_name", `%${search}%`)
        .limit(15);
      return (data ?? []) as any[];
    },
  });

  const addLead = (lead: any) => {
    if (picks.some((p) => p.candidate.lead_id === lead.id)) return;
    const days = lead.last_activity_at
      ? Math.floor((Date.now() - new Date(lead.last_activity_at).getTime()) / 86400000)
      : null;
    setPicks((p) => [
      ...p,
      {
        candidate: {
          client_id: lead.id,
          lead_id: lead.id,
          client_name: lead.customer_name + (lead.company_name ? ` (${lead.company_name})` : ""),
          area: detectArea(lead.location),
          lat: lead.address_lat,
          lng: lead.address_lng,
          priority: (lead.priority as StopPriority) || "medium",
          visit_type: "follow_up",
          open_deal_value: lead.expected_value ? Number(lead.expected_value) : null,
          days_since_last_visit: days,
        },
      },
    ]);
    setSearch("");
  };

  const removePick = (idx: number) => setPicks((p) => p.filter((_, i) => i !== idx));
  const movePick = (idx: number, dir: -1 | 1) => {
    setPicks((p) => {
      const next = [...p];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return p;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };
  const updatePick = (idx: number, patch: Partial<RouteStopCandidate>) => {
    setPicks((p) => p.map((x, i) => (i === idx ? { candidate: { ...x.candidate, ...patch } } : x)));
  };

  const optimizeFn = useServerFn(optimizeRoute);
  const suggestFn = useServerFn(suggestNearby);

  const runOptimize = async () => {
    if (!user || !companyId) return;
    if (picks.length === 0) {
      toast.error("Add at least one client");
      return;
    }
    setOptimizing(true);
    try {
      // Ensure plan
      const p = await ensurePlan({
        company_id: companyId,
        user_id: user.id,
        plan_date: dateIso,
        start_lat: DEFAULT_OFFICE.lat,
        start_lng: DEFAULT_OFFICE.lng,
        start_location: DEFAULT_OFFICE.label,
      });

      const startIso = new Date(`${dateIso}T09:00:00`).toISOString();

      const result = await optimizeFn({
        data: {
          start_lat: p.start_latitude ?? DEFAULT_OFFICE.lat,
          start_lng: p.start_longitude ?? DEFAULT_OFFICE.lng,
          start_iso: startIso,
          candidates: picks.map((x) => ({
            client_id: x.candidate.client_id,
            client_name: x.candidate.client_name,
            area: x.candidate.area ?? null,
            lat: x.candidate.lat ?? null,
            lng: x.candidate.lng ?? null,
            priority: x.candidate.priority,
            visit_type: x.candidate.visit_type,
            open_deal_value: x.candidate.open_deal_value ?? null,
            days_since_last_visit: x.candidate.days_since_last_visit ?? null,
          })),
        },
      });

      // Map sequence back into stops
      const byId = new Map(picks.map((x) => [x.candidate.client_id, x.candidate]));
      const orderedStops = result.sequence
        .map((seq, i) => {
          const c = byId.get(seq.client_id);
          if (!c) return null;
          const arrival = new Date(new Date(startIso).getTime() + seq.estimated_arrival_offset_min * 60_000);
          return {
            sequence: i + 1,
            lead_id: c.lead_id ?? null,
            account_id: c.account_id ?? null,
            customer_name: c.client_name,
            area: c.area ?? null,
            latitude: c.lat ?? null,
            longitude: c.lng ?? null,
            priority: c.priority,
            visit_type: c.visit_type,
            planned_duration_minutes: VISIT_DURATIONS[c.visit_type],
            travel_time_from_prev_min: Math.round(seq.travel_time_from_prev_min),
            distance_from_prev_km: Number(seq.distance_from_prev_km.toFixed(2)),
            estimated_arrival_time: arrival.toISOString(),
            rationale: seq.rationale,
            open_deal_value: c.open_deal_value ?? null,
            days_since_last_visit: c.days_since_last_visit ?? null,
          };
        })
        .filter(Boolean) as any[];

      await replaceStops(p.id, orderedStops);

      const totalMin = result.estimated_total_minutes;
      const returnAt = new Date(new Date(startIso).getTime() + totalMin * 60_000).toISOString();

      await updatePlan(p.id, {
        status: "draft",
        total_distance_km: Number(result.estimated_total_km.toFixed(2)),
        total_minutes: Math.round(totalMin),
        estimated_return_time: returnAt,
        traffic_warnings: result.traffic_warnings,
        ai_model: result.model,
        optimized_at: new Date().toISOString(),
      } as any);

      // Reorder picks visually
      setPicks(
        result.sequence
          .map((s) => {
            const c = byId.get(s.client_id);
            return c ? { candidate: c } : null;
          })
          .filter(Boolean) as ClientPick[],
      );

      qc.invalidateQueries({ queryKey: ["route-plan", user.id, dateIso] });
      qc.invalidateQueries({ queryKey: ["route-plan-stops"] });
      setRevealKey((k) => k + 1);
      toast.success("Route optimized");
    } catch (e: any) {
      toast.error(e?.message ?? "Optimization failed");
    } finally {
      setOptimizing(false);
    }
  };

  const confirmRoute = useMutation({
    mutationFn: async () => {
      if (!plan || !savedStops) throw new Error("No plan to confirm");
      await confirmPlanAndMaterializeTasks(plan, savedStops);
    },
    onSuccess: () => {
      toast.success("Route confirmed — tasks created");
      qc.invalidateQueries({ queryKey: ["route-plan", user?.id, dateIso] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to confirm"),
  });

  // Nearby suggestions (after confirm)
  const { data: nearby = [] } = useQuery({
    queryKey: ["route-nearby", companyId, savedStops?.length, plan?.status],
    enabled: !!companyId && !!savedStops && savedStops.length > 0 && plan?.status === "planned",
    queryFn: async () => {
      const last = savedStops![savedStops!.length - 1];
      const r = await suggestFn({
        data: {
          company_id: companyId!,
          current_area: last.area,
          current_lat: last.latitude,
          current_lng: last.longitude,
          exclude_lead_ids: savedStops!.map((s) => s.lead_id).filter(Boolean) as string[],
          limit: 5,
        },
      });
      return r as NearbySuggestion[];
    },
  });

  const addSuggestion = (n: NearbySuggestion) => {
    setPicks((p) => [
      ...p,
      {
        candidate: {
          client_id: n.lead_id,
          lead_id: n.lead_id,
          client_name: n.client_name,
          area: n.area,
          lat: n.lat,
          lng: n.lng,
          priority: "medium",
          visit_type: "follow_up",
          open_deal_value: n.open_deal_value,
          days_since_last_visit: n.days_since_last_visit,
        },
      },
    ]);
    toast.success(`${n.client_name} added — re-optimize to slot it in`);
  };

  const mapStops = useMemo(() => {
    if (!savedStops) return [];
    return savedStops
      .filter((s) => s.latitude != null && s.longitude != null)
      .map((s) => ({
        id: s.id,
        sequence: s.sequence,
        lat: s.latitude!,
        lng: s.longitude!,
        label: s.customer_name,
        priority: s.priority,
      }));
  }, [savedStops]);

  const wdn = workingDayNumber(today);
  const dateLabel = today.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Daily Route Plan</h1>
          <p className="text-sm text-muted-foreground">
            {dateLabel} · Working day #{wdn} of the month
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/route/live">
            <Button variant="outline" size="sm">
              <NavIcon className="h-4 w-4 mr-1" /> Live Tracking
            </Button>
          </Link>
        </div>
      </header>

      {/* Client picker */}
      <Card className="p-4 md:p-5 space-y-4">
        <div>
          <label className="text-sm font-medium">Add clients to today's route</label>
          <Popover open={search.length > 0} onOpenChange={(o) => !o && setSearch("")}>
            <PopoverTrigger asChild>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search client by name…"
                  className="pl-9"
                />
              </div>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
              <Command shouldFilter={false}>
                <CommandList>
                  <CommandEmpty>No matches.</CommandEmpty>
                  <CommandGroup>
                    {searchResults.map((l) => (
                      <CommandItem key={l.id} onSelect={() => addLead(l)} className="flex justify-between">
                        <span className="truncate">
                          {l.customer_name}
                          {l.company_name && (
                            <span className="text-xs text-muted-foreground"> · {l.company_name}</span>
                          )}
                        </span>
                        <Plus className="h-4 w-4 text-muted-foreground" />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {picks.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-lg">
            Search and add clients you want to visit today.
          </div>
        ) : (
          <ul className="divide-y border rounded-lg">
            {picks.map((p, i) => (
              <li key={`${p.candidate.client_id}-${i}`} className="p-3 flex items-start gap-3 animate-fade-in">
                <div className="flex flex-col items-center gap-1 pt-1">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <div className="text-xs font-semibold text-muted-foreground">{i + 1}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium truncate">{p.candidate.client_name}</div>
                    <Badge variant="outline" className={priorityBadgeClass(p.candidate.priority)}>
                      {p.candidate.priority}
                    </Badge>
                    {p.candidate.area && (
                      <Badge variant="outline" className="font-normal">
                        <MapPin className="h-3 w-3 mr-1" />
                        {p.candidate.area}
                      </Badge>
                    )}
                    {p.candidate.days_since_last_visit != null && (
                      <span className="text-xs text-muted-foreground">
                        {p.candidate.days_since_last_visit}d since last visit
                      </span>
                    )}
                    {p.candidate.open_deal_value != null && p.candidate.open_deal_value > 0 && (
                      <span className="text-xs font-medium text-emerald-600">
                        {bdt(p.candidate.open_deal_value)} open
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <Select
                      value={p.candidate.priority}
                      onValueChange={(v: StopPriority) => updatePick(i, { priority: v })}
                    >
                      <SelectTrigger className="h-8 w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={p.candidate.visit_type}
                      onValueChange={(v: VisitType) => updatePick(i, { visit_type: v })}
                    >
                      <SelectTrigger className="h-8 w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="discovery">Discovery (60m)</SelectItem>
                        <SelectItem value="follow_up">Follow-up (30m)</SelectItem>
                        <SelectItem value="demo">Demo (90m)</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={p.candidate.area ?? "_none"}
                      onValueChange={(v) => updatePick(i, { area: v === "_none" ? null : v })}
                    >
                      <SelectTrigger className="h-8 w-[130px]">
                        <SelectValue placeholder="Area" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">— Area —</SelectItem>
                        {DHAKA_AREAS.map((a) => (
                          <SelectItem key={a} value={a}>
                            {a}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => movePick(i, -1)}>
                    ↑
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => movePick(i, 1)}>
                    ↓
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removePick(i)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2 justify-between items-center pt-2">
          <p className="text-xs text-muted-foreground">
            {picks.length} client{picks.length === 1 ? "" : "s"} · AI will sequence by priority, deal urgency &
            Dhaka traffic.
          </p>
          <Button onClick={runOptimize} disabled={optimizing || picks.length === 0} size="lg" className="gap-2">
            {optimizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {plan?.optimized_at ? "Re-Optimize with AI" : "Optimize with AI"}
          </Button>
        </div>
      </Card>

      {/* Optimized route reveal */}
      {plan?.optimized_at && savedStops && savedStops.length > 0 && (
        <Card className="p-4 md:p-5 space-y-4 animate-fade-in" key={revealKey}>
          <div className="flex flex-wrap justify-between gap-3 items-start">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                AI Optimized Route
              </h2>
              <p className="text-xs text-muted-foreground">
                {savedStops.length} stops · {plan.total_distance_km?.toFixed(1) ?? "—"} km ·{" "}
                {plan.total_minutes ? formatMinutes(plan.total_minutes) : "—"} · Return by{" "}
                {plan.estimated_return_time
                  ? new Date(plan.estimated_return_time).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </p>
            </div>
            <div className="flex gap-2">
              {plan.status === "draft" && (
                <Button onClick={() => confirmRoute.mutate()} disabled={confirmRoute.isPending}>
                  {confirmRoute.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Confirm Route
                </Button>
              )}
              {plan.status === "planned" && (
                <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Confirmed
                </Badge>
              )}
            </div>
          </div>

          {plan.traffic_warnings && plan.traffic_warnings.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-amber-700">
                <AlertTriangle className="h-4 w-4" /> Traffic warnings
              </div>
              <ul className="list-disc list-inside mt-1 text-amber-700/80">
                {plan.traffic_warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid lg:grid-cols-[1fr_360px] gap-4">
            <Suspense fallback={<div className="h-[420px] rounded-lg bg-muted animate-pulse" />}>
              <RouteMap
                stops={mapStops}
                start={{ lat: plan.start_latitude ?? DEFAULT_OFFICE.lat, lng: plan.start_longitude ?? DEFAULT_OFFICE.lng, label: plan.start_location ?? DEFAULT_OFFICE.label }}
                height={420}
                animateReveal
              />
            </Suspense>

            <ol className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {savedStops.map((s) => (
                <li
                  key={s.id}
                  className="border rounded-lg p-3 animate-fade-in"
                  style={{ animationDelay: `${s.sequence * 100}ms` } as any}
                >
                  <div className="flex items-start gap-2">
                    <div
                      className="rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ background: priorityColor(s.priority) }}
                    >
                      {s.sequence}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{s.customer_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.area || "—"} · {s.visit_type.replace("_", "-")} ({s.planned_duration_minutes}m)
                      </div>
                      <div className="text-xs flex items-center gap-3 mt-1 text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {s.estimated_arrival_time
                            ? new Date(s.estimated_arrival_time).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </span>
                        <span>
                          {s.travel_time_from_prev_min}m · {s.distance_from_prev_km?.toFixed(1) ?? "—"} km
                        </span>
                      </div>
                      {s.rationale && (
                        <p className="text-xs mt-2 text-foreground/80 italic">{s.rationale}</p>
                      )}
                      {s.latitude != null && s.longitude != null && (
                        <a
                          href={googleMapsLink(s.latitude, s.longitude, s.customer_name)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary hover:underline mt-2 inline-flex items-center gap-1"
                        >
                          Open in Google Maps <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Card>
      )}

      {/* Nearby suggestions */}
      {plan?.status === "planned" && nearby.length > 0 && (
        <Card className="p-4 md:p-5 space-y-3 animate-fade-in">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Suggest Nearby
            </h3>
            <p className="text-xs text-muted-foreground">
              While you're in the area, consider these clients too.
            </p>
          </div>
          <ul className="space-y-2">
            {nearby.map((n) => (
              <li key={n.lead_id} className="flex items-center justify-between gap-3 border rounded-lg p-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{n.client_name}</div>
                  <div className="text-xs text-muted-foreground">{n.reason}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => addSuggestion(n)}>
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" onClick={runOptimize} disabled={optimizing}>
            <RefreshCw className="h-4 w-4 mr-1" /> Re-Optimize with additions
          </Button>
        </Card>
      )}
    </div>
  );
}

function priorityColor(p: StopPriority) {
  if (p === "high") return "#ef4444";
  if (p === "medium") return "#f59e0b";
  return "#10b981";
}
