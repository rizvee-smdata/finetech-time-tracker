import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapView, type MapPoint } from "@/components/gps/MapView";
import { ShieldAlert, MapPin } from "lucide-react";
import { differenceInDays, format } from "date-fns";

export const Route = createFileRoute("/_authenticated/visits/coverage")({
  component: CoveragePage,
});

type AccountRow = {
  id: string;
  customer_name: string;
  kind: "customer" | "partner" | "consultant";
  tier: "strategic" | "standard" | "low_priority" | null;
  gps_lat: number | null;
  gps_lng: number | null;
  address: string | null;
  region: string | null;
  assigned_rep_id: string | null;
};

const TIER_COLOR_FALLBACK = "#64748b";

function recencyColor(days: number | null): string {
  if (days === null) return "#94a3b8"; // grey — never visited
  if (days <= 7) return "#10b981";
  if (days <= 30) return "#f59e0b";
  return "#ef4444";
}

function recencyLabel(days: number | null): string {
  if (days === null) return "Never visited";
  if (days === 0) return "Visited today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function tierBadge(t: string | null) {
  if (!t) return <Badge variant="outline">No tier</Badge>;
  if (t === "strategic") return <Badge className="bg-primary text-primary-foreground">Strategic</Badge>;
  if (t === "standard") return <Badge variant="secondary">Standard</Badge>;
  return <Badge variant="outline">Low priority</Badge>;
}

function CoveragePage() {
  const { companyId, isStaff } = useAuth();
  const [kind, setKind] = useState<"all" | "customer" | "partner" | "consultant">("all");
  const [tier, setTier] = useState<"all" | "strategic" | "standard" | "low_priority" | "untiered">("all");
  const [rep, setRep] = useState<string>("all");
  const [recency, setRecency] = useState<"all" | "fresh" | "stale" | "cold" | "never">("all");
  const [selected, setSelected] = useState<string | null>(null);

  const { data: accounts = [] } = useQuery({
    queryKey: ["coverage-accounts", companyId],
    enabled: !!companyId && isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, customer_name, kind, tier, gps_lat, gps_lng, address, region, assigned_rep_id")
        .eq("company_id", companyId!)
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as AccountRow[];
    },
  });

  const accountIds = useMemo(() => accounts.map((a) => a.id), [accounts]);

  const { data: lastVisitMap = new Map<string, Date>() } = useQuery({
    queryKey: ["coverage-last-visits", companyId, accountIds.length],
    enabled: !!companyId && accountIds.length > 0,
    queryFn: async () => {
      const map = new Map<string, Date>();
      // visit_checkins
      const { data: vc } = await supabase
        .from("visit_checkins")
        .select("account_id, checkin_time")
        .eq("company_id", companyId!)
        .in("account_id", accountIds)
        .not("account_id", "is", null);
      (vc ?? []).forEach((r: any) => {
        if (!r.account_id || !r.checkin_time) return;
        const d = new Date(r.checkin_time);
        const cur = map.get(r.account_id);
        if (!cur || d > cur) map.set(r.account_id, d);
      });
      // customer_visits
      const { data: cv } = await supabase
        .from("customer_visits")
        .select("account_id, meeting_at")
        .eq("company_id", companyId!)
        .in("account_id", accountIds)
        .not("account_id", "is", null);
      (cv ?? []).forEach((r: any) => {
        if (!r.account_id || !r.meeting_at) return;
        const d = new Date(r.meeting_at);
        const cur = map.get(r.account_id);
        if (!cur || d > cur) map.set(r.account_id, d);
      });
      return map;
    },
  });

  const repIds = useMemo(() => {
    const s = new Set<string>();
    accounts.forEach((a) => a.assigned_rep_id && s.add(a.assigned_rep_id));
    return [...s];
  }, [accounts]);

  const { data: repNames = new Map<string, string>() } = useQuery({
    queryKey: ["coverage-rep-names", repIds.join(",")],
    enabled: repIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", repIds);
      const m = new Map<string, string>();
      (data ?? []).forEach((p: any) => m.set(p.id, p.full_name ?? "Unnamed"));
      return m;
    },
  });

  const enriched = useMemo(() => {
    return accounts.map((a) => {
      const last = lastVisitMap.get(a.id) ?? null;
      const days = last ? differenceInDays(new Date(), last) : null;
      return { ...a, lastVisit: last, daysSinceVisit: days };
    });
  }, [accounts, lastVisitMap]);

  const filtered = useMemo(() => {
    return enriched.filter((a) => {
      if (kind !== "all" && a.kind !== kind) return false;
      if (tier !== "all") {
        if (tier === "untiered" ? a.tier !== null : a.tier !== tier) return false;
      }
      if (rep !== "all") {
        if (rep === "unassigned" ? a.assigned_rep_id !== null : a.assigned_rep_id !== rep) return false;
      }
      if (recency !== "all") {
        const d = a.daysSinceVisit;
        if (recency === "fresh" && !(d !== null && d <= 7)) return false;
        if (recency === "stale" && !(d !== null && d > 7 && d <= 30)) return false;
        if (recency === "cold" && !(d !== null && d > 30)) return false;
        if (recency === "never" && d !== null) return false;
      }
      return true;
    });
  }, [enriched, kind, tier, rep, recency]);

  const mapped = filtered.filter((a) => a.gps_lat !== null && a.gps_lng !== null);
  const unmapped = filtered.length - mapped.length;

  const stats = useMemo(() => {
    let fresh = 0, stale = 0, cold = 0, never = 0;
    filtered.forEach((a) => {
      const d = a.daysSinceVisit;
      if (d === null) never++;
      else if (d <= 7) fresh++;
      else if (d <= 30) stale++;
      else cold++;
    });
    return { fresh, stale, cold, never, total: filtered.length };
  }, [filtered]);

  if (!isStaff) {
    return (
      <Card className="mx-auto mt-10 max-w-md p-6 text-center">
        <ShieldAlert className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm">Admin or manager role required to view the coverage map.</p>
      </Card>
    );
  }

  const points: MapPoint[] = mapped.map((a) => ({
    lat: a.gps_lat!,
    lng: a.gps_lng!,
    color: recencyColor(a.daysSinceVisit),
    title: `${a.customer_name} · ${recencyLabel(a.daysSinceVisit)}`,
    label: a.tier === "strategic" ? "S" : a.tier === "standard" ? "M" : a.tier === "low_priority" ? "L" : "•",
  }));

  const selectedAccount = mapped.find((a) => a.id === selected) ?? null;

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Coverage Map</h1>
          <p className="text-sm text-muted-foreground">
            Account pins coloured by visit recency. Tier marks: S=Strategic · M=Standard · L=Low priority.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" className="border-emerald-500 text-emerald-600">{stats.fresh} fresh ≤7d</Badge>
          <Badge variant="outline" className="border-amber-500 text-amber-600">{stats.stale} stale 8–30d</Badge>
          <Badge variant="outline" className="border-red-500 text-red-600">{stats.cold} cold &gt;30d</Badge>
          <Badge variant="outline">{stats.never} never</Badge>
        </div>
      </header>

      <Card className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select value={kind} onValueChange={(v) => setKind(v as any)}>
          <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="customer">Customers</SelectItem>
            <SelectItem value="partner">Partners</SelectItem>
            <SelectItem value="consultant">Consultants</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tier} onValueChange={(v) => setTier(v as any)}>
          <SelectTrigger><SelectValue placeholder="Tier" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tiers</SelectItem>
            <SelectItem value="strategic">Strategic</SelectItem>
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="low_priority">Low priority</SelectItem>
            <SelectItem value="untiered">Untiered</SelectItem>
          </SelectContent>
        </Select>
        <Select value={rep} onValueChange={setRep}>
          <SelectTrigger><SelectValue placeholder="Assigned rep" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All reps</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {repIds.map((id) => (
              <SelectItem key={id} value={id}>{repNames.get(id) ?? "Rep"}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={recency} onValueChange={(v) => setRecency(v as any)}>
          <SelectTrigger><SelectValue placeholder="Recency" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All recency</SelectItem>
            <SelectItem value="fresh">Fresh (≤7d)</SelectItem>
            <SelectItem value="stale">Stale (8–30d)</SelectItem>
            <SelectItem value="cold">Cold (&gt;30d)</SelectItem>
            <SelectItem value="never">Never visited</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      {unmapped > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {unmapped} account{unmapped === 1 ? "" : "s"} match filters but have no GPS coordinates set — they won't appear on the map.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {mapped.length > 0 ? (
            <MapView
              points={points}
              height={520}
              onMarkerClick={(i) => setSelected(mapped[i]?.id ?? null)}
            />
          ) : (
            <Card className="flex h-[520px] items-center justify-center p-6 text-center text-sm text-muted-foreground">
              <div>
                <MapPin className="mx-auto mb-2 h-6 w-6 opacity-50" />
                No mapped accounts match the current filters.
              </div>
            </Card>
          )}
        </div>

        <Card className="max-h-[520px] overflow-y-auto p-3">
          {selectedAccount ? (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{selectedAccount.customer_name}</div>
                  <div className="text-xs capitalize text-muted-foreground">{selectedAccount.kind}</div>
                </div>
                {tierBadge(selectedAccount.tier)}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: recencyColor(selectedAccount.daysSinceVisit) }} />
                <span>{recencyLabel(selectedAccount.daysSinceVisit)}</span>
                {selectedAccount.lastVisit && (
                  <span className="text-muted-foreground">· {format(selectedAccount.lastVisit, "MMM d, yyyy")}</span>
                )}
              </div>
              {selectedAccount.address && <div className="text-xs text-muted-foreground">{selectedAccount.address}</div>}
              {selectedAccount.region && <div className="text-xs">Region: <span className="font-medium">{selectedAccount.region}</span></div>}
              <div className="text-xs">
                Assigned rep:{" "}
                <span className="font-medium">
                  {selectedAccount.assigned_rep_id ? (repNames.get(selectedAccount.assigned_rep_id) ?? "Rep") : "Unassigned"}
                </span>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="mt-2 text-xs text-primary underline-offset-2 hover:underline"
              >
                Clear selection
              </button>
            </div>
          ) : (
            <div className="space-y-2 text-xs">
              <div className="font-semibold">Top accounts to revisit</div>
              <p className="text-muted-foreground">Sorted by days since last visit (oldest first).</p>
              <ul className="space-y-1.5 pt-1">
                {[...filtered]
                  .sort((a, b) => (b.daysSinceVisit ?? 99999) - (a.daysSinceVisit ?? 99999))
                  .slice(0, 12)
                  .map((a) => (
                    <li
                      key={a.id}
                      className="flex cursor-pointer items-center justify-between gap-2 rounded-md border p-2 hover:bg-accent"
                      onClick={() => a.gps_lat && setSelected(a.id)}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{a.customer_name}</div>
                        <div className="truncate text-[11px] capitalize text-muted-foreground">
                          {a.kind} · {recencyLabel(a.daysSinceVisit)}
                        </div>
                      </div>
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: recencyColor(a.daysSinceVisit) }}
                      />
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
