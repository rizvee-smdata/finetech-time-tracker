import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { getGpsAudit, listAuditReps, type AuditCheckin } from "@/lib/gps-audit/audit.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MapView, type MapPoint } from "@/components/gps/MapView";
import {
  ShieldAlert,
  AlertTriangle,
  Download,
  MapPin,
  Camera,
  Clock,
  Gauge,
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/gps/audit")({
  beforeLoad: async () => {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", s.session.user.id);
    if (!(roles ?? []).some((r) => r.role === "admin" || r.role === "manager")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: GpsAuditPage,
});

function GpsAuditPage() {
  const fetchAudit = useServerFn(getGpsAudit);
  const fetchReps = useServerFn(listAuditReps);
  const [from, setFrom] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [repId, setRepId] = useState<string>("all");
  const [severity, setSeverity] = useState<"all" | "high" | "medium" | "low" | "flagged">("all");
  const [selectedRep, setSelectedRep] = useState<string | null>(null);

  const { data: repsList } = useQuery({
    queryKey: ["audit-reps"],
    queryFn: () => fetchReps({}),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["gps-audit", from, to, repId],
    queryFn: () =>
      fetchAudit({ data: { from, to, repId: repId === "all" ? null : repId } }),
  });

  const checkins = data?.checkins ?? [];
  const reps = data?.reps ?? [];

  const filtered = useMemo(() => {
    let rows = checkins;
    if (selectedRep) rows = rows.filter((c) => c.user_id === selectedRep);
    if (severity === "flagged") rows = rows.filter((c) => c.anomalies.length > 0);
    else if (severity !== "all")
      rows = rows.filter((c) => c.anomalies.some((a) => a.severity === severity));
    return rows;
  }, [checkins, selectedRep, severity]);

  const totals = useMemo(() => {
    const flat = checkins.flatMap((c) => c.anomalies);
    return {
      checkins: checkins.length,
      flagged: checkins.filter((c) => c.anomalies.length > 0).length,
      high: flat.filter((a) => a.severity === "high").length,
      medium: flat.filter((a) => a.severity === "medium").length,
      reps: reps.length,
    };
  }, [checkins, reps]);

  const mapPoints: MapPoint[] = filtered
    .slice(0, 200)
    .map((c) => ({
      lat: c.checkin_lat,
      lng: c.checkin_lng,
      title: `${c.rep_name} · ${c.client_name ?? "Check-in"}`,
      color:
        c.anomalies.some((a) => a.severity === "high")
          ? "#ef4444"
          : c.anomalies.length
            ? "#f59e0b"
            : "#10b981",
    }));

  function exportCsv() {
    const header = [
      "checkin_time",
      "rep",
      "client",
      "duration_min",
      "distance_m",
      "geofence_valid",
      "selfie",
      "anomaly_count",
      "high_anomalies",
      "anomalies",
      "lat",
      "lng",
    ];
    const rows = filtered.map((c) => [
      c.checkin_time,
      c.rep_name,
      c.client_name ?? "",
      c.duration_minutes ?? "",
      c.distance_from_client_m ?? "",
      c.is_geofence_valid ? "yes" : "no",
      c.selfie_url ? "yes" : "no",
      c.anomalies.length,
      c.anomalies.filter((a) => a.severity === "high").length,
      c.anomalies.map((a) => `${a.kind}:${a.message}`).join(" | "),
      c.checkin_lat,
      c.checkin_lng,
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gps-audit-${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-2 md:p-0">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ShieldAlert className="h-6 w-6 text-primary" /> GPS Audit
          </h1>
          <p className="text-sm text-muted-foreground">
            Company-wide field check-in audit with automatic anomaly flagging.
          </p>
        </div>
        <Button onClick={exportCsv} variant="outline" className="gap-2">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </header>

      <Card className="flex flex-wrap items-end gap-3 p-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">From</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">To</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="min-w-[200px]">
          <label className="mb-1 block text-xs text-muted-foreground">Rep</label>
          <Select value={repId} onValueChange={setRepId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All reps</SelectItem>
              {(repsList?.reps ?? []).map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs text-muted-foreground">Severity</label>
          <Select value={severity} onValueChange={(v) => setSeverity(v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All check-ins</SelectItem>
              <SelectItem value="flagged">Flagged only</SelectItem>
              <SelectItem value="high">High severity</SelectItem>
              <SelectItem value="medium">Medium severity</SelectItem>
              <SelectItem value="low">Low severity</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Check-ins" value={totals.checkins} />
        <Stat label="Flagged" value={totals.flagged} tone="warning" />
        <Stat label="High severity" value={totals.high} tone="danger" />
        <Stat label="Medium" value={totals.medium} tone="warning" />
        <Stat label="Reps active" value={totals.reps} />
      </div>

      <Card className="overflow-hidden">
        <div className="border-b p-3 text-sm font-medium">Rep scorecard</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rep</TableHead>
              <TableHead className="text-right">Check-ins</TableHead>
              <TableHead className="text-right">Km</TableHead>
              <TableHead className="text-right">Geofence override</TableHead>
              <TableHead className="text-right">Missing selfie</TableHead>
              <TableHead className="text-right">Short visits</TableHead>
              <TableHead className="text-right">Impossible speed</TableHead>
              <TableHead className="text-right">High severity</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reps.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-6 text-center text-xs text-muted-foreground">
                  {isLoading ? "Loading…" : "No check-ins in this period."}
                </TableCell>
              </TableRow>
            )}
            {reps.map((r) => (
              <TableRow
                key={r.user_id}
                className={selectedRep === r.user_id ? "bg-muted/50" : ""}
              >
                <TableCell className="font-medium">{r.rep_name}</TableCell>
                <TableCell className="text-right">{r.total_checkins}</TableCell>
                <TableCell className="text-right">{r.km_driven.toFixed(1)}</TableCell>
                <TableCell className="text-right">{r.geofence_overrides || "—"}</TableCell>
                <TableCell className="text-right">{r.missing_selfies || "—"}</TableCell>
                <TableCell className="text-right">{r.short_visits || "—"}</TableCell>
                <TableCell className="text-right">{r.impossible_speeds || "—"}</TableCell>
                <TableCell className="text-right">
                  {r.high_severity > 0 ? (
                    <Badge variant="destructive">{r.high_severity}</Badge>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setSelectedRep(selectedRep === r.user_id ? null : r.user_id)
                    }
                  >
                    {selectedRep === r.user_id ? "Clear" : "Focus"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {mapPoints.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b p-3 text-sm font-medium">Check-in map</div>
          <MapView points={mapPoints} height={340} />
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="border-b p-3 text-sm font-medium">
          Check-ins ({filtered.length})
        </div>
        <div className="divide-y">
          {filtered.slice(0, 300).map((c) => (
            <CheckinRow key={c.id} c={c} />
          ))}
          {filtered.length === 0 && (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Nothing matches the current filters.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warning" | "danger";
}) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={
          "text-2xl font-semibold " +
          (tone === "danger"
            ? "text-destructive"
            : tone === "warning"
              ? "text-amber-600"
              : "")
        }
      >
        {value}
      </div>
    </Card>
  );
}

function CheckinRow({ c }: { c: AuditCheckin }) {
  const highest = c.anomalies.some((a) => a.severity === "high")
    ? "high"
    : c.anomalies.some((a) => a.severity === "medium")
      ? "medium"
      : c.anomalies.length
        ? "low"
        : "ok";

  return (
    <div className="flex flex-col gap-2 p-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-medium">{c.rep_name}</div>
          <span className="text-muted-foreground">·</span>
          <div className="truncate">{c.client_name ?? "Check-in"}</div>
          {highest === "high" && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" /> High
            </Badge>
          )}
          {highest === "medium" && (
            <Badge variant="outline" className="gap-1 border-amber-500 text-amber-700">
              <AlertTriangle className="h-3 w-3" /> Medium
            </Badge>
          )}
          {highest === "low" && (
            <Badge variant="secondary" className="gap-1">
              <AlertTriangle className="h-3 w-3" /> Low
            </Badge>
          )}
          {highest === "ok" && (
            <Badge variant="default" className="gap-1">
              <CheckCircle2 className="h-3 w-3" /> Clean
            </Badge>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {format(new Date(c.checkin_time), "MMM d, p")}
            {c.checkout_time ? ` → ${format(new Date(c.checkout_time), "p")}` : " · ongoing"}
          </span>
          {c.duration_minutes != null && (
            <span className="inline-flex items-center gap-1">
              <Gauge className="h-3 w-3" />
              {c.duration_minutes} min
            </span>
          )}
          {c.distance_from_client_m != null && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {Math.round(c.distance_from_client_m)} m from client
            </span>
          )}
          {c.selfie_url ? (
            <span className="inline-flex items-center gap-1">
              <Camera className="h-3 w-3" /> selfie
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-600">
              <Camera className="h-3 w-3" /> no selfie
            </span>
          )}
        </div>
        {c.anomalies.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs">
            {c.anomalies.map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  className={
                    "mt-0.5 inline-block h-2 w-2 rounded-full " +
                    (a.severity === "high"
                      ? "bg-destructive"
                      : a.severity === "medium"
                        ? "bg-amber-500"
                        : "bg-muted-foreground")
                  }
                />
                <span>
                  <span className="font-medium capitalize">
                    {a.kind.replace(/_/g, " ")}:
                  </span>{" "}
                  {a.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
