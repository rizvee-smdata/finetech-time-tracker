import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { BookOpen, Pencil, Plus, Search, Trash2, Target } from "lucide-react";
import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PaginationBar, usePagination } from "@/components/PageSizeSelect";
import { convertVisitToLead } from "@/lib/crm/queries";
import { VisitAIPanel } from "@/components/visits/VisitAIPanel";
import { OfficeWorkFormDialog } from "@/components/office-work/OfficeWorkFormDialog";
import { OfficeWorkCard } from "@/components/office-work/OfficeWorkCard";
import { MyDayStrip } from "@/components/office-work/MyDayStrip";
import { OfficeWorkReminderBanner } from "@/components/office-work/ReminderBanner";
import {
  fetchOfficeWorkLogs, fetchWorkCategories, deleteDayLog, sunThuWeek, todayDhaka,
  type OfficeWorkLog,
} from "@/lib/officeWork/api";

export const Route = createFileRoute("/_authenticated/visits/")({
  component: VisitsList,
});

type Visit = {
  id: string;
  user_id: string;
  company_id: string | null;
  customer_name: string;
  designation: string | null;
  email: string | null;
  company: string | null;
  contact_number: string | null;
  location: string | null;
  meeting_at: string;
  discussion_summary: string | null;
  next_action: string | null;
  next_meeting_at: string | null;
  remarks: string | null;
  status: string;
};

type MergedItem =
  | { kind: "visit"; date: string; visit: any }
  | { kind: "office"; date: string; log: OfficeWorkLog };

function VisitsList() {
  const { user, isStaff, companyId } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "visit" | "office">("all");
  const [personFilter, setPersonFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const week = sunThuWeek(todayDhaka());
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [editing, setEditing] = useState<Visit | null>(null);
  const [viewing, setViewing] = useState<any | null>(null);
  const [officeOpen, setOfficeOpen] = useState(false);
  const [editingLogDate, setEditingLogDate] = useState<string | undefined>(undefined);

  const cats = useQuery({ queryKey: ["work-categories"], queryFn: fetchWorkCategories });

  const visitsQ = useQuery({
    queryKey: ["visits", user?.id, isStaff, companyId],
    enabled: !!user,
    queryFn: async () => {
      const query = supabase
        .from("customer_visits")
        .select("*")
        .neq("status", "office_study")
        .order("meeting_at", { ascending: false });
      if (companyId) query.eq("company_id", companyId);
      if (!isStaff) query.eq("user_id", user!.id);
      const { data, error } = await query;
      if (error) throw error;
      const visits = (data ?? []) as Visit[];
      let profilesMap = new Map<string, { full_name: string | null; email: string | null }>();
      if (isStaff && visits.length) {
        const ids = Array.from(new Set(visits.map((v) => v.user_id)));
        const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
        for (const p of profs ?? []) profilesMap.set(p.id, { full_name: p.full_name, email: p.email });
      }
      return visits.map((v) => ({ ...v, author: profilesMap.get(v.user_id) ?? null }));
    },
  });

  const logsQ = useQuery({
    queryKey: ["office-work-logs", user?.id, isStaff, companyId],
    enabled: !!user,
    queryFn: async () => {
      const logs = await fetchOfficeWorkLogs({
        companyId, userId: isStaff ? undefined : user!.id, scope: "all",
      });
      if (isStaff && logs.length) {
        const ids = Array.from(new Set(logs.map((l) => l.user_id)));
        const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
        const pm = new Map((profs ?? []).map((p) => [p.id, { full_name: p.full_name, email: p.email }]));
        logs.forEach((l) => { l.author = pm.get(l.user_id) ?? null; });
      }
      return logs;
    },
  });

  const people = useQuery({
    queryKey: ["visits-people", companyId],
    enabled: isStaff && !!companyId,
    queryFn: async () => {
      const { data } = await (supabase as any).from("company_members")
        .select("user_id, profiles:user_id(id, full_name, email)")
        .eq("company_id", companyId);
      return (data ?? []).map((r: any) => r.profiles).filter(Boolean) as Array<{ id: string; full_name: string | null; email: string | null }>;
    },
  });

  const merged: MergedItem[] = useMemo(() => {
    const items: MergedItem[] = [];
    (visitsQ.data ?? []).forEach((v: any) => items.push({ kind: "visit", date: v.meeting_at, visit: v }));
    (logsQ.data ?? []).forEach((l) => items.push({ kind: "office", date: `${l.work_date}T18:00:00+06:00`, log: l }));
    return items.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [visitsQ.data, logsQ.data]);

  const filtered = useMemo(() => merged.filter((it) => {
    if (typeFilter === "visit" && it.kind !== "visit") return false;
    if (typeFilter === "office" && it.kind !== "office") return false;
    if (personFilter) {
      const uid = it.kind === "visit" ? it.visit.user_id : it.log.user_id;
      if (uid !== personFilter) return false;
    }
    if (categoryFilter && it.kind === "office") {
      if (!it.log.tasks.some((t) => t.category_id === categoryFilter)) return false;
    }
    if (categoryFilter && it.kind === "visit") return false;
    if (fromDate) {
      const d = it.kind === "visit" ? it.visit.meeting_at.slice(0, 10) : it.log.work_date;
      if (d < fromDate) return false;
    }
    if (toDate) {
      const d = it.kind === "visit" ? it.visit.meeting_at.slice(0, 10) : it.log.work_date;
      if (d > toDate) return false;
    }
    if (q) {
      const s = q.toLowerCase();
      if (it.kind === "visit") {
        const v = it.visit;
        return (v.customer_name?.toLowerCase().includes(s)
          || v.company?.toLowerCase().includes(s)
          || v.location?.toLowerCase().includes(s)
          || v.discussion_summary?.toLowerCase().includes(s));
      } else {
        return it.log.tasks.some((t) =>
          t.description.toLowerCase().includes(s) || (t.project_name ?? "").toLowerCase().includes(s));
      }
    }
    return true;
  }), [merged, typeFilter, personFilter, categoryFilter, fromDate, toDate, q]);

  async function deleteVisit(id: string) {
    const { error } = await supabase.from("customer_visits").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["visits"] });
  }
  async function deleteLog(id: string) {
    try { await deleteDayLog(id); toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["office-work-logs"] }); }
    catch (e: any) { toast.error(e.message); }
  }

  const pg = usePagination(filtered, 20);

  function setPreset(kind: "today" | "week" | "lastWeek" | "month") {
    const today = todayDhaka();
    if (kind === "today") { setFromDate(today); setToDate(today); return; }
    if (kind === "week") { const w = sunThuWeek(today); setFromDate(w.start); setToDate(w.end); return; }
    if (kind === "lastWeek") {
      const start = new Date(`${week.start}T12:00:00+06:00`); start.setDate(start.getDate() - 7);
      const iso = start.toISOString().slice(0, 10);
      const w2 = sunThuWeek(iso); setFromDate(w2.start); setToDate(w2.end); return;
    }
    if (kind === "month") { const [y, m] = today.split("-"); setFromDate(`${y}-${m}-01`); setToDate(today); }
  }

  function openLogDate(date?: string) {
    setEditingLogDate(date);
    setOfficeOpen(true);
  }

  return (
    <div className="space-y-4">
      <OfficeWorkReminderBanner onLog={() => openLogDate()} />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customer visits & office work</h1>
          <p className="text-sm text-muted-foreground">{isStaff ? "All team activity" : "Your daily activity"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => openLogDate()}><BookOpen className="mr-2 h-4 w-4" />Office work</Button>
          <Button asChild><Link to="/visits/new"><Plus className="mr-2 h-4 w-4" />New visit</Link></Button>
        </div>
      </header>

      <MyDayStrip onLogOffice={() => openLogDate()} />

      {/* Filters */}
      <Card className="p-3 flex flex-wrap items-end gap-2">
        <div className="relative min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-9" />
        </div>
        <div className="inline-flex rounded-md border p-0.5">
          {(["all", "visit", "office"] as const).map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`px-3 py-1 text-xs rounded ${typeFilter === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}>
              {t === "all" ? "All" : t === "visit" ? "Customer visits" : "Office work"}
            </button>
          ))}
        </div>
        {isStaff && (
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}>
            <option value="">All people</option>
            {(people.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
          </select>
        )}
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All categories</option>
          {(cats.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <Label className="text-xs">From</Label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-[140px] h-9" />
          <Label className="text-xs">To</Label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-[140px] h-9" />
        </div>
        <div className="flex gap-1">
          {(["today", "week", "lastWeek", "month"] as const).map((k) => (
            <Button key={k} size="sm" variant="outline" onClick={() => setPreset(k)}>
              {k === "today" ? "Today" : k === "week" ? "This week" : k === "lastWeek" ? "Last week" : "This month"}
            </Button>
          ))}
          {(fromDate || toDate) && <Button size="sm" variant="ghost" onClick={() => { setFromDate(""); setToDate(""); }}>Clear</Button>}
        </div>
      </Card>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            No entries. Log office work or record a new visit to get started.
          </Card>
        )}
        {pg.paged.map((it: MergedItem) => it.kind === "office" ? (
          <OfficeWorkCard
            key={`o-${it.log.id}`}
            log={it.log}
            categories={cats.data ?? []}
            showAuthor={isStaff}
            canEdit={it.log.user_id === user?.id || isStaff}
            onEdit={() => openLogDate(it.log.work_date)}
            onDelete={() => deleteLog(it.log.id)}
          />
        ) : (
          <VisitCard
            key={`v-${it.visit.id}`}
            v={it.visit}
            isStaff={isStaff}
            onView={() => setViewing(it.visit)}
            onEdit={() => setEditing(it.visit)}
            onDelete={() => deleteVisit(it.visit.id)}
          />
        ))}
      </div>

      <PaginationBar {...pg} label="entries" />

      <ViewVisitDialog visit={viewing} onClose={() => setViewing(null)}
        onEdit={(v) => { setViewing(null); setEditing(v); }} isStaff={isStaff} />
      <EditVisitDialog visit={editing} onClose={() => setEditing(null)} />
      <OfficeWorkFormDialog open={officeOpen} onOpenChange={setOfficeOpen} initialDate={editingLogDate} />
    </div>
  );
}

function VisitCard({ v, isStaff, onView, onEdit, onDelete }: any) {
  return (
    <Card
      className="p-5 cursor-pointer transition-colors hover:bg-accent/30"
      onClick={onView}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onView(); } }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold flex items-center gap-2">
            {v.customer_name}
            <span className="font-normal text-muted-foreground">· {v.company || "—"}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {format(new Date(v.meeting_at), "PPpp")}
            {v.location && <> · {v.location}</>}
            {isStaff && v.author && <> · {v.author.full_name || v.author.email}</>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {v.next_meeting_at && (
            <div className="text-right text-xs">
              <div className="text-muted-foreground">Next meeting</div>
              <div className="font-medium">{format(new Date(v.next_meeting_at), "MMM d, p")}</div>
            </div>
          )}
          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); onEdit(); }} title="Edit"><Pencil className="h-4 w-4" /></Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" title="Delete" onClick={(e) => e.stopPropagation()}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
                <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      {v.discussion_summary && <p className="mt-3 text-sm whitespace-pre-wrap line-clamp-3">{v.discussion_summary}</p>}
      {v.next_action && (
        <div className="mt-3 rounded-md bg-accent/50 px-3 py-2 text-sm">
          <span className="font-medium text-accent-foreground">Next action: </span>{v.next_action}
        </div>
      )}
      {v.remarks && <p className="mt-2 text-xs text-muted-foreground">Remarks: {v.remarks}</p>}
    </Card>
  );
}

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

function EditVisitDialog({ visit, onClose }: { visit: Visit | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    if (!visit) return;
    setForm({
      customer_name: visit.customer_name ?? "",
      designation: visit.designation ?? "",
      email: visit.email ?? "",
      company: visit.company ?? "",
      contact_number: visit.contact_number ?? "",
      location: visit.location ?? "",
      meeting_at: toLocalInput(visit.meeting_at),
      discussion_summary: visit.discussion_summary ?? "",
      next_action: visit.next_action ?? "",
      next_meeting_at: toLocalInput(visit.next_meeting_at),
      remarks: visit.remarks ?? "",
    });
  }, [visit]);

  async function save() {
    if (!visit) return;
    setBusy(true);
    const { error } = await supabase.from("customer_visits").update({
      customer_name: form.customer_name,
      designation: form.designation || null,
      email: form.email || null,
      company: form.company || null,
      contact_number: form.contact_number || null,
      location: form.location || null,
      meeting_at: form.meeting_at ? new Date(form.meeting_at).toISOString() : visit.meeting_at,
      discussion_summary: form.discussion_summary || null,
      next_action: form.next_action || null,
      next_meeting_at: form.next_meeting_at ? new Date(form.next_meeting_at).toISOString() : null,
      remarks: form.remarks || null,
    }).eq("id", visit.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Visit updated");
    qc.invalidateQueries({ queryKey: ["visits"] });
    onClose();
  }

  return (
    <Dialog open={!!visit} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit visit</DialogTitle>
          <DialogDescription>Update the details and save.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Customer name *</Label><Input value={form.customer_name || ""} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></div>
            <div className="grid gap-2"><Label>Company</Label><Input value={form.company || ""} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
            <div className="grid gap-2"><Label>Designation</Label><Input value={form.designation || ""} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></div>
            <div className="grid gap-2"><Label>Email</Label><Input type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="grid gap-2"><Label>Contact number</Label><Input value={form.contact_number || ""} onChange={(e) => setForm({ ...form, contact_number: e.target.value })} /></div>
            <div className="grid gap-2"><Label>Location</Label><Input value={form.location || ""} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          </div>
          <div className="grid gap-2"><Label>Meeting date & time *</Label><Input type="datetime-local" value={form.meeting_at || ""} onChange={(e) => setForm({ ...form, meeting_at: e.target.value })} /></div>
          <div className="grid gap-2"><Label>Discussion summary</Label><Textarea rows={3} value={form.discussion_summary || ""} onChange={(e) => setForm({ ...form, discussion_summary: e.target.value })} /></div>
          <div className="grid gap-2"><Label>Next action</Label><Textarea rows={2} value={form.next_action || ""} onChange={(e) => setForm({ ...form, next_action: e.target.value })} /></div>
          <div className="grid gap-2"><Label>Next meeting</Label><Input type="datetime-local" value={form.next_meeting_at || ""} onChange={(e) => setForm({ ...form, next_meeting_at: e.target.value })} /></div>
          <div className="grid gap-2"><Label>Remarks</Label><Textarea rows={2} value={form.remarks || ""} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving..." : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function ViewVisitDialog({ visit, onClose, onEdit, isStaff }: { visit: any | null; onClose: () => void; onEdit: (v: Visit) => void; isStaff: boolean }) {
  if (!visit) return null;
  const dash = <span className="text-muted-foreground">—</span>;
  return (
    <Dialog open={!!visit} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{visit.customer_name}</DialogTitle>
          <DialogDescription>
            {format(new Date(visit.meeting_at), "PPpp")}
            {isStaff && visit.author && <> · {visit.author.full_name || visit.author.email}</>}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailRow label="Customer" value={visit.customer_name || dash} />
            <DetailRow label="Company" value={visit.company || dash} />
            <DetailRow label="Designation" value={visit.designation || dash} />
            <DetailRow label="Email" value={visit.email || dash} />
            <DetailRow label="Contact number" value={visit.contact_number || dash} />
            <DetailRow label="Location" value={visit.location || dash} />
          </div>
          <DetailRow label="Discussion summary" value={visit.discussion_summary ? <p className="whitespace-pre-wrap">{visit.discussion_summary}</p> : dash} />
          <DetailRow label="Next action" value={visit.next_action ? <p className="whitespace-pre-wrap">{visit.next_action}</p> : dash} />
          <DetailRow label="Next meeting" value={visit.next_meeting_at ? format(new Date(visit.next_meeting_at), "PPpp") : dash} />
          <DetailRow label="Remarks" value={visit.remarks ? <p className="whitespace-pre-wrap">{visit.remarks}</p> : dash} />
          <VisitAIPanel visit={visit} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <ConvertToLeadButton visit={visit} />
          <Button onClick={() => onEdit(visit)}><Pencil className="mr-2 h-4 w-4" />Edit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConvertToLeadButton({ visit }: { visit: any }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  async function go() {
    if (!user) return;
    setBusy(true);
    try {
      const id = await convertVisitToLead(visit, user.id);
      toast.success("Lead created");
      nav({ to: "/crm/$leadId", params: { leadId: id } });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }
  return (
    <Button variant="secondary" onClick={go} disabled={busy}>
      <Target className="mr-2 h-4 w-4" />{busy ? "Converting…" : "Mark as Lead"}
    </Button>
  );
}
