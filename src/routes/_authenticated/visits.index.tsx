import { createFileRoute, Link } from "@tanstack/react-router";
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
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { BookOpen, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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

function VisitsList() {
  const { user, isStaff, companyId } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Visit | null>(null);

  const { data } = useQuery({
    queryKey: ["visits", user?.id, isStaff, companyId],
    enabled: !!user,
    queryFn: async () => {
      const query = supabase
        .from("customer_visits")
        .select("*")
        .order("meeting_at", { ascending: false });
      if (companyId) query.eq("company_id", companyId);
      if (!isStaff) query.eq("user_id", user!.id);
      const { data, error } = await query;
      if (error) throw error;
      const visits = (data ?? []) as Visit[];

      // Fetch author names separately (no FK between customer_visits and profiles)
      let profilesMap = new Map<string, { full_name: string | null; email: string | null }>();
      if (isStaff && visits.length) {
        const ids = Array.from(new Set(visits.map((v) => v.user_id)));
        const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
        for (const p of profs ?? []) profilesMap.set(p.id, { full_name: p.full_name, email: p.email });
      }
      return visits.map((v) => ({ ...v, author: profilesMap.get(v.user_id) ?? null }));
    },
  });

  const filtered = (data ?? []).filter((v) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      v.customer_name?.toLowerCase().includes(s) ||
      v.company?.toLowerCase().includes(s) ||
      v.location?.toLowerCase().includes(s) ||
      v.discussion_summary?.toLowerCase().includes(s)
    );
  });

  async function deleteVisit(id: string) {
    const { error } = await supabase.from("customer_visits").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["visits"] });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customer visits</h1>
          <p className="text-sm text-muted-foreground">{isStaff ? "All team visits" : "Your visit reports"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <OfficeStudyDialog />
          <Button asChild><Link to="/visits/new"><Plus className="mr-2 h-4 w-4" />New visit</Link></Button>
        </div>
      </header>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, company, location..." className="pl-9" />
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            No entries yet. Click "New visit" or "Office study" to add one.
          </Card>
        )}
        {filtered.map((v: any) => {
          const isStudy = v.status === "office_study";
          return (
            <Card key={v.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    {isStudy ? (
                      <>
                        <BookOpen className="h-4 w-4 text-primary" />
                        Office study
                      </>
                    ) : (
                      <>
                        {v.customer_name}
                        <span className="font-normal text-muted-foreground">· {v.company || "—"}</span>
                      </>
                    )}
                    {isStudy && <Badge variant="secondary">No visit</Badge>}
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
                  <Button size="icon" variant="ghost" onClick={() => setEditing(v)} title="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" title="Delete">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
                        <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteVisit(v.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              {v.discussion_summary && <p className="mt-3 text-sm whitespace-pre-wrap">{v.discussion_summary}</p>}
              {v.next_action && (
                <div className="mt-3 rounded-md bg-accent/50 px-3 py-2 text-sm">
                  <span className="font-medium text-accent-foreground">Next action: </span>{v.next_action}
                </div>
              )}
              {v.remarks && <p className="mt-2 text-xs text-muted-foreground">Remarks: {v.remarks}</p>}
            </Card>
          );
        })}
      </div>

      <EditVisitDialog visit={editing} onClose={() => setEditing(null)} />
    </div>
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
    const { error } = await supabase
      .from("customer_visits")
      .update({
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
      })
      .eq("id", visit.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Visit updated");
    qc.invalidateQueries({ queryKey: ["visits"] });
    onClose();
  }

  const isStudy = visit?.status === "office_study";

  return (
    <Dialog open={!!visit} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {isStudy ? "office study" : "visit"}</DialogTitle>
          <DialogDescription>Update the details and save.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          {!isStudy && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Customer name *</Label>
                <Input value={form.customer_name || ""} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Company</Label>
                <Input value={form.company || ""} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Contact number</Label>
                <Input value={form.contact_number || ""} onChange={(e) => setForm({ ...form, contact_number: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Location</Label>
                <Input value={form.location || ""} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
            </div>
          )}
          <div className="grid gap-2">
            <Label>Meeting date & time *</Label>
            <Input type="datetime-local" value={form.meeting_at || ""} onChange={(e) => setForm({ ...form, meeting_at: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label>{isStudy ? "Notes" : "Discussion summary"}</Label>
            <Textarea rows={3} value={form.discussion_summary || ""} onChange={(e) => setForm({ ...form, discussion_summary: e.target.value })} />
          </div>
          {!isStudy && (
            <>
              <div className="grid gap-2">
                <Label>Next action</Label>
                <Textarea rows={2} value={form.next_action || ""} onChange={(e) => setForm({ ...form, next_action: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Next meeting</Label>
                <Input type="datetime-local" value={form.next_meeting_at || ""} onChange={(e) => setForm({ ...form, next_meeting_at: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Remarks</Label>
                <Textarea rows={2} value={form.remarks || ""} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving..." : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OfficeStudyDialog() {
  const { user, companyId } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState("I studied in office all day (no customer visit).");

  async function save() {
    if (!user) return;
    if (!companyId) return toast.error("Select a company first");
    if (!date) return toast.error("Pick date & time");
    setBusy(true);
    const { error } = await supabase.from("customer_visits").insert({
      user_id: user.id,
      company_id: companyId,
      customer_name: "Office study",
      status: "office_study",
      meeting_at: new Date(date).toISOString(),
      discussion_summary: notes.trim() || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Office study logged");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["visits"] });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><BookOpen className="mr-2 h-4 w-4" />Office study</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log office study</DialogTitle>
          <DialogDescription>
            Use this when you didn't visit any customer and spent the day studying in office.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="os_date">Date & time *</Label>
            <Input id="os_date" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="os_notes">Notes</Label>
            <Textarea id="os_notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
