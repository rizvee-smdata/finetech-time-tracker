import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchLead, fetchActivities, fetchQuotes, fetchAttachments, fetchLeadTasks,
  updateLeadStage, addActivity, fetchCompanyMembers, fetchRelatedVisits,
} from "@/lib/crm/queries";
import { STAGES, stageMeta, formatMoney, ACTIVE_STAGES, type CrmStage } from "@/lib/crm/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Mail, Phone, MapPin, Calendar, Pencil, Plus, Paperclip, Trash2, Upload, FileText } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { LeadFormDialog } from "@/components/crm/LeadFormDialog";
import { QuoteBuilderDialog } from "@/components/crm/QuoteBuilderDialog";
import { CallsPanel } from "@/components/crm/CallsPanel";
import { AIInsightsPanel } from "@/components/crm/AIInsightsPanel";
import { SequencesPanel } from "@/components/crm/SequencesPanel";
import { LeadScoreCard } from "@/components/crm/LeadScoreCard";


const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/crm/$leadId")({
  component: LeadDetail,
});

function LeadDetail() {
  const { leadId } = Route.useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const leadQ = useQuery({ queryKey: ["crm-lead", leadId], queryFn: () => fetchLead(leadId) });
  const lead = leadQ.data;

  const activities = useQuery({ queryKey: ["crm-activities", leadId], queryFn: () => fetchActivities(leadId) });
  const quotes = useQuery({ queryKey: ["crm-quotes", leadId], queryFn: () => fetchQuotes(leadId) });
  const attachments = useQuery({ queryKey: ["crm-attachments", leadId], queryFn: () => fetchAttachments(leadId) });
  const tasks = useQuery({ queryKey: ["crm-tasks", leadId], queryFn: () => fetchLeadTasks(leadId) });
  const visit = useQuery({
    queryKey: ["crm-source-visit", lead?.source_visit_id],
    enabled: !!lead?.source_visit_id,
    queryFn: async () => {
      const { data } = await sb.from("customer_visits").select("*").eq("id", lead!.source_visit_id).maybeSingle();
      return data;
    },
  });
  const relatedVisits = useQuery({
    queryKey: ["crm-related-visits", leadId, lead?.customer_name, lead?.company_name, lead?.phone],
    enabled: !!lead,
    queryFn: () => fetchRelatedVisits({
      companyId: lead!.company_id,
      customerName: lead!.customer_name,
      companyName: lead!.company_name,
      phone: lead!.phone,
      excludeId: lead!.source_visit_id,
    }),
  });

  if (leadQ.isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!lead) return <div className="text-sm text-muted-foreground">Lead not found.</div>;

  const meta = stageMeta(lead.stage);

  async function moveStage(stage: CrmStage) {
    let reason: string | undefined;
    if (stage === "lost") {
      reason = window.prompt("Reason?") || undefined;
    }
    await updateLeadStage(lead!.id, stage, reason);
    toast.success(`Moved to ${stageMeta(stage).label}`);
    qc.invalidateQueries({ queryKey: ["crm-lead", leadId] });
    qc.invalidateQueries({ queryKey: ["crm-activities", leadId] });
    qc.invalidateQueries({ queryKey: ["crm-leads"] });
  }

  async function onDelete() {
    const { error } = await sb.from("crm_leads").delete().eq("id", lead!.id);
    if (error) return toast.error(error.message);
    toast.success("Lead deleted");
    qc.invalidateQueries({ queryKey: ["crm-leads"] });
    nav({ to: "/crm/list" });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/crm/pipeline"><ArrowLeft className="mr-2 h-4 w-4" />Back to pipeline</Link>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil className="mr-2 h-4 w-4" />Edit</Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm"><Trash2 className="mr-2 h-4 w-4 text-destructive" />Delete</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
                <AlertDialogDescription>All activities, quotes, and attachments will be removed.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{lead.customer_name}</h1>
            {lead.company_name && <p className="text-sm text-muted-foreground">{lead.company_name}</p>}
            <div className="flex flex-wrap gap-3 pt-2 text-xs text-muted-foreground">
              {lead.contact_person && <span>{lead.contact_person}{lead.designation && ` · ${lead.designation}`}</span>}
              {lead.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</span>}
              {lead.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email}</span>}
              {lead.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{lead.location}</span>}
            </div>
          </div>
          <div className="text-right space-y-1">
            <Badge variant="outline" className={meta.badge}>{meta.label}</Badge>
            <div className="text-2xl font-bold">{formatMoney(lead.expected_value, lead.currency)}</div>
            <div className="text-xs text-muted-foreground">{lead.probability}% probability</div>
            {lead.expected_close_date && (
              <div className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                <Calendar className="h-3 w-3" />Close {format(new Date(lead.expected_close_date), "MMM d, yyyy")}
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {STAGES.map((s) => (
            <Button
              key={s.id}
              size="sm"
              variant={lead.stage === s.id ? "default" : "outline"}
              onClick={() => moveStage(s.id)}
              disabled={lead.stage === s.id}
            >
              <span className={`mr-2 h-2 w-2 rounded-full ${s.color}`} />
              {s.label}
            </Button>
          ))}
        </div>

        <div className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
          <Field label="Assigned to" value={lead.assignee?.full_name || lead.assignee?.email || "Unassigned"} />
          <Field label="Source" value={lead.source === "visit" ? (
            visit.data ? <Link className="text-primary hover:underline" to="/visits">From visit · {format(new Date(visit.data.meeting_at), "MMM d")}</Link> : "Visit"
          ) : "Manual"} />
          <Field label="Last activity" value={formatDistanceToNow(new Date(lead.last_activity_at), { addSuffix: true })} />
        </div>

        {lead.notes && <div className="mt-4 whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">{lead.notes}</div>}
        {(lead.competitor_name || lead.competitor_price || lead.competitor_notes) && (
          <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Competitor</div>
            <div className="mt-1 flex flex-wrap gap-3">
              {lead.competitor_name && <span className="font-medium">{lead.competitor_name}</span>}
              {lead.competitor_price != null && <span>{formatMoney(lead.competitor_price, lead.currency)}</span>}
            </div>
            {lead.competitor_notes && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{lead.competitor_notes}</p>}
          </div>
        )}
        {lead.stage === "lost" && lead.lost_reason && (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <span className="font-medium">Lost reason: </span>{lead.lost_reason}
          </div>
        )}
      </Card>

      <LeadScoreCard lead={lead as any} activityCount={activities.data?.length ?? 0} />

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">Timeline ({activities.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="calls">Calls</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({tasks.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="quotes">Quotes ({quotes.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
          <TabsTrigger value="sequences">Sequences</TabsTrigger>
          <TabsTrigger value="visits">Visits ({relatedVisits.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="attachments">Files ({attachments.data?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="space-y-4">
          <AddActivity leadId={leadId} userId={user!.id} />
          <Timeline items={activities.data ?? []} />
        </TabsContent>

        <TabsContent value="calls" className="space-y-4">
          <CallsPanel leadId={leadId} userId={user!.id} phone={lead.phone} />
        </TabsContent>

        <TabsContent value="tasks" className="space-y-4">
          <AddTask leadId={leadId} companyId={lead.company_id} userId={user!.id} />
          <TaskList items={tasks.data ?? []} />
        </TabsContent>

        <TabsContent value="quotes" className="space-y-4">
          <QuotesPanel leadId={leadId} companyId={lead.company_id} userId={user!.id} quotes={quotes.data ?? []} />
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
          <AIInsightsPanel leadId={leadId} />
        </TabsContent>

        <TabsContent value="sequences" className="space-y-4">
          <SequencesPanel leadId={leadId} companyId={lead.company_id} userId={user!.id} />
        </TabsContent>



        <TabsContent value="visits" className="space-y-4">
          <RelatedVisits items={relatedVisits.data ?? []} />
        </TabsContent>

        <TabsContent value="attachments" className="space-y-4">
          <UploadAttachment leadId={leadId} userId={user!.id} />
          <AttachmentList items={attachments.data ?? []} />
        </TabsContent>
      </Tabs>

      <LeadFormDialog open={editing} onOpenChange={setEditing} lead={lead} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}

// =========================================================
// Timeline
// =========================================================
function AddActivity({ leadId, userId }: { leadId: string; userId: string }) {
  const qc = useQueryClient();
  const [type, setType] = useState<"note" | "call" | "email" | "meeting">("note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim()) return toast.error("Title required");
    setBusy(true);
    try {
      await addActivity({ lead_id: leadId, activity_type: type, title: title.trim(), body: body || undefined, user_id: userId });
      setTitle(""); setBody("");
      qc.invalidateQueries({ queryKey: ["crm-activities", leadId] });
      qc.invalidateQueries({ queryKey: ["crm-lead", leadId] });
      toast.success("Logged");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex gap-2">
        <Select value={type} onValueChange={(v) => setType(v as any)}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="note">Note</SelectItem>
            <SelectItem value="call">Call</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="meeting">Meeting</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="Title…" value={title} onChange={(e) => setTitle(e.target.value)} className="flex-1" />
      </div>
      <Textarea rows={2} placeholder="Details (optional)" value={body} onChange={(e) => setBody(e.target.value)} />
      <Button size="sm" onClick={submit} disabled={busy}><Plus className="mr-2 h-4 w-4" />Add activity</Button>
    </Card>
  );
}

function Timeline({ items }: { items: any[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  return (
    <div className="space-y-3">
      {items.map((a) => (
        <Card key={a.id} className="p-4">
          <div className="flex items-center justify-between text-xs">
            <Badge variant="secondary" className="capitalize">{a.activity_type.replace("_", " ")}</Badge>
            <span className="text-muted-foreground">{format(new Date(a.occurred_at), "PPp")}</span>
          </div>
          {a.title && <div className="mt-2 font-medium">{a.title}</div>}
          {a.body && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{a.body}</p>}
        </Card>
      ))}
    </div>
  );
}

// =========================================================
// Tasks (reuses tms_tasks via lead_id)
// =========================================================
function AddTask({ leadId, companyId, userId }: { leadId: string; companyId: string; userId: string }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState<string>("none");
  const [busy, setBusy] = useState(false);

  const members = useQuery({
    queryKey: ["crm-company-members", companyId],
    queryFn: () => fetchCompanyMembers(companyId),
  });

  async function submit() {
    if (!title.trim()) return toast.error("Title required");
    setBusy(true);
    const { data: task, error } = await sb.from("tms_tasks").insert({
      company_id: companyId,
      created_by: userId,
      title: title.trim(),
      due_date: due || null,
      lead_id: leadId,
    }).select("id").single();
    if (error) { setBusy(false); return toast.error(error.message); }

    if (assignee !== "none" && task?.id) {
      await sb.from("tms_task_assignees").insert({ task_id: task.id, user_id: assignee, assigned_by: userId });
      // also create a reminder for the assignee
      if (due) {
        await sb.from("reminders").insert({
          user_id: assignee,
          company_id: companyId,
          title: `Follow-up: ${title.trim()}`,
          body: `Lead task due ${due}`,
          remind_at: new Date(due).toISOString(),
        });
      }
    }
    setBusy(false);
    setTitle(""); setDue(""); setAssignee("none");
    qc.invalidateQueries({ queryKey: ["crm-tasks", leadId] });
    toast.success("Task added");
  }

  return (
    <Card className="p-4 flex flex-wrap gap-2 items-end">
      <div className="flex-1 min-w-[200px] grid gap-1">
        <Label className="text-xs">Follow-up task</Label>
        <Input placeholder="What needs doing?" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">Assignee</Label>
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Me / unassigned —</SelectItem>
            {(members.data ?? []).map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">Due</Label>
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </div>
      <Button onClick={submit} disabled={busy}><Plus className="mr-2 h-4 w-4" />Add</Button>
    </Card>
  );
}

function RelatedVisits({ items }: { items: any[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No related visits found for this contact/company.</p>;
  return (
    <div className="space-y-2">
      {items.map((v) => (
        <Card key={v.id} className="p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium text-sm">{v.customer_name}{v.company && <span className="text-muted-foreground"> · {v.company}</span>}</div>
              <div className="text-xs text-muted-foreground">{format(new Date(v.meeting_at), "PPp")}{v.location && <> · {v.location}</>}</div>
              {v.discussion_summary && <p className="mt-1 text-sm whitespace-pre-wrap">{v.discussion_summary}</p>}
            </div>
            <Badge variant="outline" className="capitalize shrink-0">{v.status?.replace("_", " ")}</Badge>
          </div>
        </Card>
      ))}
    </div>
  );
}

function TaskList({ items }: { items: any[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No tasks yet.</p>;
  const now = new Date();
  return (
    <div className="space-y-2">
      {items.map((t) => {
        const overdue = t.due_date && !t.tms_task_statuses?.is_terminal && new Date(t.due_date) < now;
        return (
          <Card key={t.id} className="p-3 flex items-center justify-between">
            <div>
              <div className="font-medium text-sm">{t.title}</div>
              <div className="text-xs text-muted-foreground">
                {t.tms_task_statuses?.name ?? "—"}
                {t.due_date && <> · due {format(new Date(t.due_date), "MMM d")}</>}
              </div>
            </div>
            {overdue && <Badge variant="destructive">Overdue</Badge>}
          </Card>
        );
      })}
    </div>
  );
}

// =========================================================
// Quotes
// =========================================================
function QuotesPanel({ leadId, companyId, userId, quotes }: { leadId: string; companyId: string; userId: string; quotes: any[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const nextVersion = (quotes[0]?.version ?? 0) + 1;

  async function setStatus(q: any, status: string) {
    if (status === "sent" && q.approval_status === "requested") return toast.error("Pending approval");
    if (status === "sent" && Number(q.discount_pct) >= 15 && q.approval_status !== "approved") {
      return toast.error("Discount needs approval first");
    }
    const { error } = await sb.from("crm_quotes").update({ status }).eq("id", q.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["crm-quotes", q.lead_id] });
    qc.invalidateQueries({ queryKey: ["crm-activities", q.lead_id] });
    qc.invalidateQueries({ queryKey: ["crm-lead", q.lead_id] });
  }

  async function decide(q: any, decision: "approved" | "rejected", comment?: string) {
    const { error } = await sb.from("crm_quotes").update({
      approval_status: decision,
      approval_comment: comment ?? null,
      approved_by: userId,
      approved_at: new Date().toISOString(),
    }).eq("id", q.id);
    if (error) return toast.error(error.message);
    toast.success(`Approval ${decision}`);
    qc.invalidateQueries({ queryKey: ["crm-quotes", q.lead_id] });
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />New quote v{nextVersion}
        </Button>
      </div>

      {quotes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No quotes yet.</p>
      ) : (
        <div className="space-y-2">
          {quotes.map((q) => (
            <Card key={q.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">v{q.version} · {q.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {formatMoney(q.amount, q.currency)}
                    {Number(q.discount_pct) > 0 && <> · {q.discount_pct}% discount</>}
                    {Number(q.tax_pct) > 0 && <> · {q.tax_pct}% tax</>}
                    {q.valid_until && <> · valid until {format(new Date(q.valid_until), "MMM d")}</>}
                  </div>
                  {q.notes && <p className="mt-2 text-sm">{q.notes}</p>}
                </div>
                <div className="text-right space-y-1">
                  <div className="flex flex-wrap justify-end gap-1">
                    <Badge variant={q.status === "accepted" ? "default" : q.status === "rejected" ? "destructive" : "secondary"} className="capitalize">{q.status}</Badge>
                    {q.approval_status && q.approval_status !== "not_requested" && (
                      <Badge variant="outline" className="capitalize">approval: {String(q.approval_status).replace("_", " ")}</Badge>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => { setEditing(q); setOpen(true); }}>Edit</Button>
                    {q.approval_status === "requested" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => decide(q, "approved")}>Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => {
                          const c = window.prompt("Reason (optional)") || undefined;
                          decide(q, "rejected", c);
                        }}>Reject</Button>
                      </>
                    )}
                    {q.status === "draft" && <Button size="sm" variant="outline" onClick={() => setStatus(q, "sent")}>Mark sent</Button>}
                    {q.status === "sent" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setStatus(q, "accepted")}>Accept</Button>
                        <Button size="sm" variant="outline" onClick={() => setStatus(q, "rejected")}>Reject</Button>
                      </>
                    )}
                    {q.file_path && <Button size="sm" variant="ghost" onClick={async () => {
                      const { data, error } = await sb.storage.from("crm-attachments").createSignedUrl(q.file_path, 60);
                      if (error) return toast.error(error.message);
                      window.open(data.signedUrl, "_blank");
                    }}><FileText className="h-4 w-4" /></Button>}
                  </div>
                  {q.approval_comment && <div className="text-xs text-muted-foreground italic max-w-xs">"{q.approval_comment}"</div>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <QuoteBuilderDialog
        open={open}
        onOpenChange={setOpen}
        leadId={leadId}
        companyId={companyId}
        userId={userId}
        quote={editing}
        newVersion={nextVersion}
      />
    </>
  );
}


// =========================================================
// Attachments
// =========================================================
function UploadAttachment({ leadId, userId }: { leadId: string; userId: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const path = `${leadId}/${Date.now()}-${file.name}`;
    const { error: upErr } = await sb.storage.from("crm-attachments").upload(path, file);
    if (upErr) { setBusy(false); return toast.error(upErr.message); }
    const { error } = await sb.from("crm_lead_attachments").insert({
      lead_id: leadId, file_path: path, file_name: file.name,
      file_size: file.size, content_type: file.type, uploaded_by: userId,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["crm-attachments", leadId] });
    toast.success("File uploaded");
    e.target.value = "";
  }

  return (
    <Card className="p-4">
      <Label className="text-xs">Upload proposal / agreement / image</Label>
      <Input type="file" onChange={onFile} disabled={busy} className="mt-2" />
    </Card>
  );
}

function AttachmentList({ items }: { items: any[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No files yet.</p>;
  async function open(a: any) {
    const { data, error } = await sb.storage.from("crm-attachments").createSignedUrl(a.file_path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  }
  return (
    <div className="space-y-2">
      {items.map((a) => (
        <Card key={a.id} className="p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm truncate">{a.file_name}</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => open(a)}>Open</Button>
        </Card>
      ))}
    </div>
  );
}
