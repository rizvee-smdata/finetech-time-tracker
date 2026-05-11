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
import { BookOpen, Plus, Search } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/visits/")({
  component: VisitsList,
});

function VisitsList() {
  const { user, isStaff, companyId } = useAuth();
  const [q, setQ] = useState("");

  const { data } = useQuery({
    queryKey: ["visits", user?.id, isStaff, companyId],
    enabled: !!user,
    queryFn: async () => {
      const query = supabase
        .from("customer_visits")
        .select("*, profiles:user_id(full_name, email)")
        .order("meeting_at", { ascending: false });
      if (companyId) query.eq("company_id", companyId);
      if (!isStaff) query.eq("user_id", user!.id);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
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
        {filtered.map((v) => {
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
                    {isStaff && v.profiles && <> · {(v.profiles as any).full_name || (v.profiles as any).email}</>}
                  </div>
                </div>
                {v.next_meeting_at && (
                  <div className="text-right text-xs">
                    <div className="text-muted-foreground">Next meeting</div>
                    <div className="font-medium">{format(new Date(v.next_meeting_at), "MMM d, p")}</div>
                  </div>
                )}
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
    </div>
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
