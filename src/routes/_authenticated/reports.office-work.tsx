import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchOfficeWorkLogs, fetchWorkCategories, formatHm, formatHours,
  sunThuWeek, todayDhaka, type OfficeWorkLog, type WorkCategory,
} from "@/lib/officeWork/api";
import { Download } from "lucide-react";
import { toast } from "sonner";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/reports/office-work")({
  component: OfficeWorkReportPage,
});

function OfficeWorkReportPage() {
  const { user, isStaff, companyId } = useAuth();
  const week = sunThuWeek(todayDhaka());
  const [from, setFrom] = useState(week.start);
  const [to, setTo] = useState(week.end);
  const [personId, setPersonId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [projectSearch, setProjectSearch] = useState<string>("");

  if (!isStaff) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        This report is only visible to managers and admins.
      </Card>
    );
  }

  const cats = useQuery({ queryKey: ["work-categories"], queryFn: fetchWorkCategories });

  const people = useQuery({
    queryKey: ["company-members-profiles", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await sb.from("company_members")
        .select("user_id, profiles:user_id(id, full_name, email)")
        .eq("company_id", companyId);
      return (data ?? []).map((r: any) => r.profiles).filter(Boolean) as Array<{ id: string; full_name: string | null; email: string | null }>;
    },
  });

  const logs = useQuery({
    queryKey: ["office-work-report", companyId, from, to, personId],
    enabled: !!user,
    queryFn: () => fetchOfficeWorkLogs({
      companyId, userId: personId || undefined,
      fromDate: from, toDate: to, scope: "all",
    }),
  });

  const catMap = useMemo(
    () => new Map<string, WorkCategory>((cats.data ?? []).map((c) => [c.id, c])),
    [cats.data],
  );
  const peopleMap = useMemo(
    () => new Map<string, { full_name: string | null; email: string | null }>(
      (people.data ?? []).map((p) => [p.id, { full_name: p.full_name, email: p.email }]),
    ),
    [people.data],
  );

  // Apply filters
  const filteredLogs: OfficeWorkLog[] = useMemo(() => {
    const arr = logs.data ?? [];
    return arr.map((l) => {
      const tasks = l.tasks.filter((t) => {
        if (categoryId && t.category_id !== categoryId) return false;
        if (projectSearch) {
          const s = projectSearch.toLowerCase();
          const p = (t.project_name ?? "").toLowerCase();
          const d = t.description.toLowerCase();
          if (!p.includes(s) && !d.includes(s)) return false;
        }
        return true;
      });
      return { ...l, tasks, total_minutes: tasks.reduce((s, t) => s + t.duration_minutes, 0) };
    }).filter((l) => l.tasks.length > 0);
  }, [logs.data, categoryId, projectSearch]);

  // KPIs
  const totalMin = filteredLogs.reduce((s, l) => s + l.total_minutes, 0);
  const uniqueDays = new Set(filteredLogs.map((l) => `${l.user_id}:${l.work_date}`)).size;
  const uniquePeople = new Set(filteredLogs.map((l) => l.user_id)).size;
  const workingDaysInRange = countWorkingDays(from, to);
  const avgHours = uniquePeople > 0 && workingDaysInRange > 0
    ? (totalMin / 60) / (uniquePeople * workingDaysInRange)
    : 0;
  const blockedTasks = filteredLogs.flatMap((l) =>
    l.tasks.filter((t) => t.status === "blocked").map((t) => ({ log: l, task: t })),
  );

  // Category shares
  const byCat = new Map<string, number>();
  filteredLogs.forEach((l) => l.tasks.forEach((t) => byCat.set(t.category_id, (byCat.get(t.category_id) ?? 0) + t.duration_minutes)));
  const catSlices = Array.from(byCat.entries())
    .map(([id, m]) => ({ cat: catMap.get(id), minutes: m }))
    .filter((x) => x.cat)
    .sort((a, b) => b.minutes - a.minutes);
  const totalCatMin = catSlices.reduce((s, x) => s + x.minutes, 0) || 1;

  // By project
  const byProj = new Map<string, number>();
  filteredLogs.forEach((l) => l.tasks.forEach((t) => {
    const key = t.project_name?.trim() || "—";
    byProj.set(key, (byProj.get(key) ?? 0) + t.duration_minutes);
  }));
  const projSlices = Array.from(byProj.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxProjMin = Math.max(1, ...projSlices.map((x) => x[1]));

  // Missing logs
  const workingDays = enumerateWorkingDays(from, to);
  const memberIds = (people.data ?? []).map((p) => p.id);
  const havePerDay = new Map<string, Set<string>>(); // date -> set of user_ids
  filteredLogs.forEach((l) => {
    if (!havePerDay.has(l.work_date)) havePerDay.set(l.work_date, new Set());
    havePerDay.get(l.work_date)!.add(l.user_id);
  });
  // Visits query (separate)
  const visits = useQuery({
    queryKey: ["visits-in-range", companyId, from, to],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await sb.from("customer_visits")
        .select("user_id, meeting_at").eq("company_id", companyId)
        .gte("meeting_at", `${from}T00:00:00+06:00`).lte("meeting_at", `${to}T23:59:59+06:00`)
        .neq("status", "office_study");
      return (data ?? []) as Array<{ user_id: string; meeting_at: string }>;
    },
  });
  if (visits.data) {
    for (const v of visits.data) {
      const d = new Date(v.meeting_at).toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
      if (!havePerDay.has(d)) havePerDay.set(d, new Set());
      havePerDay.get(d)!.add(v.user_id);
    }
  }
  const missing: Array<{ date: string; person: { full_name: string | null; email: string | null } }> = [];
  for (const day of workingDays) {
    const done = havePerDay.get(day) ?? new Set();
    for (const uid of memberIds) {
      if (personId && uid !== personId) continue;
      if (!done.has(uid)) {
        const p = peopleMap.get(uid);
        if (p) missing.push({ date: day, person: p });
      }
    }
  }
  const missingDays = missing.length;

  // Weekly timesheet (uses filteredLogs)
  const currentWeek = sunThuWeek(from);
  const timesheet = useMemo(() => {
    const grid = new Map<string, Map<string, number>>(); // userId -> date -> minutes
    for (const l of filteredLogs) {
      if (!currentWeek.days.includes(l.work_date)) continue;
      if (!grid.has(l.user_id)) grid.set(l.user_id, new Map());
      grid.get(l.user_id)!.set(l.work_date, (grid.get(l.user_id)!.get(l.work_date) ?? 0) + l.total_minutes);
    }
    return grid;
  }, [filteredLogs, currentWeek.days.join(",")]);

  function exportCSV() {
    const rows: string[][] = [
      ["Date", "Person", "Category", "Project", "Description", "Duration (h)", "Status", "Blocker note"],
    ];
    for (const l of filteredLogs) {
      const p = peopleMap.get(l.user_id);
      const pname = p?.full_name || p?.email || l.user_id;
      for (const t of l.tasks) {
        rows.push([
          l.work_date, pname,
          catMap.get(t.category_id)?.name ?? "",
          t.project_name ?? "",
          t.description,
          (t.duration_minutes / 60).toFixed(2),
          t.status,
          t.blocker_note ?? "",
        ]);
      }
    }
    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `office-work-${from}_to_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  }

  function setPreset(kind: "today" | "week" | "lastWeek" | "month") {
    const today = todayDhaka();
    if (kind === "today") { setFrom(today); setTo(today); return; }
    if (kind === "week") {
      const w = sunThuWeek(today); setFrom(w.start); setTo(w.end); return;
    }
    if (kind === "lastWeek") {
      const w = sunThuWeek(today);
      const start = new Date(`${w.start}T12:00:00+06:00`); start.setDate(start.getDate() - 7);
      const iso = start.toISOString().slice(0, 10);
      const w2 = sunThuWeek(iso); setFrom(w2.start); setTo(w2.end); return;
    }
    if (kind === "month") {
      const [y, m] = today.split("-");
      setFrom(`${y}-${m}-01`); setTo(today); return;
    }
  }

  return (
    <div className="space-y-5">
      {/* Filters */}
      <Card className="p-3 flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label className="text-xs">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" />
        </div>
        <div className="flex gap-1">
          {(["today", "week", "lastWeek", "month"] as const).map((k) => (
            <Button key={k} size="sm" variant="outline" onClick={() => setPreset(k)}>
              {k === "today" ? "Today" : k === "week" ? "This week" : k === "lastWeek" ? "Last week" : "This month"}
            </Button>
          ))}
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Person</Label>
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={personId} onChange={(e) => setPersonId(e.target.value)}>
            <option value="">All</option>
            {(people.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
          </select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Category</Label>
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">All</option>
            {(cats.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="grid gap-1 flex-1 min-w-[160px]">
          <Label className="text-xs">Project / customer</Label>
          <Input value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)} placeholder="Search…" />
        </div>
        <Button variant="outline" onClick={exportCSV}><Download className="mr-1 h-4 w-4" /> Export CSV</Button>
      </Card>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total hours" value={formatHours(totalMin)} />
        <Kpi label="Avg hrs / person / working day" value={avgHours.toFixed(1) + "h"} />
        <Kpi label="Blocked tasks" value={String(blockedTasks.length)} />
        <Kpi label="Missing days" value={String(missingDays)} />
      </div>

      {/* Charts */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 font-semibold">Hours by category</div>
          {catSlices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data</p>
          ) : (
            <div className="space-y-2">
              {catSlices.map((s) => (
                <div key={s.cat!.id} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded" style={{ background: s.cat!.color }} />
                      {s.cat!.name}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatHours(s.minutes)} · {Math.round((s.minutes / totalCatMin) * 100)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded bg-muted overflow-hidden">
                    <div className="h-full" style={{ width: `${(s.minutes / totalCatMin) * 100}%`, background: s.cat!.color }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-3 font-semibold">Hours by project / customer (top 10)</div>
          {projSlices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data</p>
          ) : (
            <div className="space-y-2">
              {projSlices.map(([name, mins]) => (
                <div key={name} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="truncate max-w-[70%]">{name}</span>
                    <span className="tabular-nums text-muted-foreground">{formatHours(mins)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded bg-muted overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${(mins / maxProjMin) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Blocked */}
      <Card className="p-4">
        <div className="mb-3 font-semibold flex items-center gap-2">Blocked tasks <Badge variant="destructive">{blockedTasks.length}</Badge></div>
        {blockedTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No blocked tasks in the selected range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr><th className="py-2 pr-3">Date</th><th className="pr-3">Person</th><th className="pr-3">Category</th><th className="pr-3">Project</th><th className="pr-3">Description</th><th>Blocker</th></tr>
              </thead>
              <tbody>
                {blockedTasks
                  .sort((a, b) => b.log.work_date.localeCompare(a.log.work_date))
                  .map(({ log, task }) => {
                    const p = peopleMap.get(log.user_id);
                    return (
                      <tr key={task.id} className="border-t">
                        <td className="py-2 pr-3">{log.work_date}</td>
                        <td className="pr-3">{p?.full_name || p?.email || "—"}</td>
                        <td className="pr-3">{catMap.get(task.category_id)?.name ?? ""}</td>
                        <td className="pr-3">{task.project_name ?? "—"}</td>
                        <td className="pr-3">{task.description}</td>
                        <td>{task.blocker_note ?? "—"}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Missing */}
      <Card className="p-4">
        <div className="mb-3 font-semibold">Missing logs</div>
        {missing.length === 0 ? (
          <p className="text-sm text-muted-foreground">Everyone logged something on every working day. 🎉</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr><th className="py-2 pr-3">Date</th><th>Person</th></tr>
              </thead>
              <tbody>
                {missing.map((m, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-2 pr-3">{m.date}</td>
                    <td>{m.person.full_name || m.person.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Weekly timesheet grid */}
      <Card className="p-4">
        <div className="mb-3 font-semibold">Weekly timesheet ({currentWeek.start} – {currentWeek.end})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Person</th>
                {currentWeek.days.map((d) => (
                  <th key={d} className="pr-3">
                    {new Date(`${d}T12:00:00+06:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {(people.data ?? []).map((p) => {
                const row = timesheet.get(p.id);
                if (personId && p.id !== personId) return null;
                const totalRow = currentWeek.days.reduce((s, d) => s + (row?.get(d) ?? 0), 0);
                return (
                  <tr key={p.id} className="border-t">
                    <td className="py-2 pr-3">{p.full_name || p.email}</td>
                    {currentWeek.days.map((d) => {
                      const mins = row?.get(d) ?? 0;
                      const h = mins / 60;
                      const cls = mins === 0 ? "bg-muted text-muted-foreground"
                        : h >= 7 ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
                        : h >= 4 ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                        : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
                      return (
                        <td key={d} className="pr-3">
                          <span className={`inline-block rounded px-2 py-0.5 text-xs ${cls}`}>{mins === 0 ? "—" : formatHm(mins)}</span>
                        </td>
                      );
                    })}
                    <td className="font-medium">{formatHours(totalRow)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </Card>
  );
}

function csvEscape(s: string) {
  if (s == null) return "";
  const needs = /[",\n]/.test(s);
  const v = s.replace(/"/g, '""');
  return needs ? `"${v}"` : v;
}

function enumerateWorkingDays(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(`${from}T12:00:00+06:00`);
  const end = new Date(`${to}T12:00:00+06:00`);
  for (let d = new Date(start); d.getTime() <= end.getTime(); d.setDate(d.getDate() + 1)) {
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dhaka", weekday: "short" }).format(d);
    if (wd !== "Fri" && wd !== "Sat") out.push(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(d));
  }
  return out;
}

function countWorkingDays(from: string, to: string) {
  return enumerateWorkingDays(from, to).length;
}
