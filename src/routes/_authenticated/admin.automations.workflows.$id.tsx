import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Plus, Trash2, ArrowLeft, ArrowUp, ArrowDown, GitBranch, Clock, UserPlus, Pencil,
  Mail, MessageSquare, Phone, CheckSquare, Webhook, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { fetchAssignableMembers } from "@/lib/crm/queries";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/admin/automations/workflows/$id")({
  head: () => ({ meta: [{ title: "Workflow Editor — Lavisho TT" }] }),
  component: WorkflowEditorPage,
});

type StepType =
  | "condition" | "delay" | "assign" | "update_field"
  | "send_email" | "send_whatsapp" | "send_sms"
  | "create_task" | "call_webhook" | "require_approval";

type Step = {
  id: string;
  workflow_id: string;
  sort_order: number;
  step_type: StepType;
  config: any;
  next_on_true: string | null;
  next_on_false: string | null;
};

type Workflow = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  is_active: boolean;
};

const STEP_META: Record<StepType, { label: string; icon: any; color: string }> = {
  condition:        { label: "Condition (if / else)", icon: GitBranch,   color: "text-amber-600" },
  delay:            { label: "Delay / wait",          icon: Clock,       color: "text-blue-600" },
  assign:           { label: "Assign to user",        icon: UserPlus,    color: "text-emerald-600" },
  update_field:     { label: "Update field",          icon: Pencil,      color: "text-violet-600" },
  send_email:       { label: "Send email",            icon: Mail,        color: "text-sky-600" },
  send_whatsapp:    { label: "Send WhatsApp",         icon: MessageSquare, color: "text-green-600" },
  send_sms:         { label: "Send SMS",              icon: Phone,       color: "text-teal-600" },
  create_task:      { label: "Create task",           icon: CheckSquare, color: "text-indigo-600" },
  call_webhook:     { label: "Call webhook",          icon: Webhook,     color: "text-rose-600" },
  require_approval: { label: "Require approval",      icon: ShieldCheck, color: "text-orange-600" },
};

const CONDITION_FIELDS = [
  "source", "industry", "territory_id", "stage", "country", "score", "value",
];
const CONDITION_OPS = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "gt", label: ">" },
  { value: "lt", label: "<" },
  { value: "is_set", label: "is set" },
  { value: "is_empty", label: "is empty" },
];

function WorkflowEditorPage() {
  const { id } = Route.useParams();
  const { companyId, isAdmin } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  if (!companyId) return <p className="p-6 text-sm text-muted-foreground">Select a company first.</p>;
  if (!isAdmin) return <p className="p-6 text-sm text-muted-foreground">Admins & managers only.</p>;

  const wf = useQuery({
    queryKey: ["workflow", id],
    queryFn: async () => {
      const { data, error } = await sb.from("workflows").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Workflow;
    },
  });

  const stepsQ = useQuery({
    queryKey: ["workflow-steps", id],
    queryFn: async () => {
      const { data, error } = await sb
        .from("workflow_steps")
        .select("*")
        .eq("workflow_id", id)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Step[];
    },
  });

  const members = useQuery({
    queryKey: ["assignable-members", companyId],
    queryFn: () => fetchAssignableMembers(companyId),
  });

  const steps = stepsQ.data ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => steps.find((s) => s.id === selectedId) ?? null, [steps, selectedId]);

  async function addStep(step_type: StepType) {
    const sort_order = steps.length ? Math.max(...steps.map((s) => s.sort_order)) + 10 : 10;
    const { data, error } = await sb
      .from("workflow_steps")
      .insert({ workflow_id: id, step_type, sort_order, config: defaultConfig(step_type) })
      .select()
      .single();
    if (error) return toast.error(error.message);
    setSelectedId(data.id);
    qc.invalidateQueries({ queryKey: ["workflow-steps", id] });
  }

  async function move(step: Step, dir: -1 | 1) {
    const idx = steps.findIndex((s) => s.id === step.id);
    const swap = steps[idx + dir];
    if (!swap) return;
    const a = sb.from("workflow_steps").update({ sort_order: swap.sort_order }).eq("id", step.id);
    const b = sb.from("workflow_steps").update({ sort_order: step.sort_order }).eq("id", swap.id);
    const [{ error: e1 }, { error: e2 }] = await Promise.all([a, b]);
    if (e1 || e2) return toast.error((e1 || e2)!.message);
    qc.invalidateQueries({ queryKey: ["workflow-steps", id] });
  }

  async function removeStep(step: Step) {
    if (!confirm("Delete this step?")) return;
    const { error } = await sb.from("workflow_steps").delete().eq("id", step.id);
    if (error) return toast.error(error.message);
    if (selectedId === step.id) setSelectedId(null);
    qc.invalidateQueries({ queryKey: ["workflow-steps", id] });
  }

  async function saveStep(patch: Partial<Step>) {
    if (!selected) return;
    const { error } = await sb.from("workflow_steps").update(patch).eq("id", selected.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["workflow-steps", id] });
  }

  async function toggleActive() {
    if (!wf.data) return;
    const { error } = await sb.from("workflows").update({ is_active: !wf.data.is_active }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["workflow", id] });
  }

  if (wf.isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (!wf.data) return <p className="p-6 text-sm text-muted-foreground">Workflow not found.</p>;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/admin/automations" })}>
            <ArrowLeft className="mr-1 h-4 w-4" />Back to Automations
          </Button>
          <h1 className="text-2xl font-bold mt-2">{wf.data.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="capitalize">{wf.data.trigger_type.replace(/_/g, " ")}</Badge>
            {!wf.data.is_active && <Badge variant="secondary">Inactive</Badge>}
            <span className="text-xs text-muted-foreground">{steps.length} step{steps.length === 1 ? "" : "s"}</span>
          </div>
          {wf.data.description && <p className="text-sm text-muted-foreground mt-1">{wf.data.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={wf.data.is_active} onCheckedChange={toggleActive} id="wfactive" />
          <Label htmlFor="wfactive" className="text-xs">{wf.data.is_active ? "Active" : "Inactive"}</Label>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        {/* Steps list */}
        <Card className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Steps</h3>
            <AddStepMenu onAdd={addStep} />
          </div>
          <Separator />
          <div className="space-y-1.5 max-h-[70vh] overflow-y-auto">
            {steps.length === 0 && (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No steps yet. Add your first one above.
              </p>
            )}
            {steps.map((s, i) => {
              const meta = STEP_META[s.step_type];
              const Icon = meta.icon;
              const active = selectedId === s.id;
              return (
                <div
                  key={s.id}
                  className={`rounded border px-2 py-2 cursor-pointer transition ${active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                  onClick={() => setSelectedId(s.id)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                    <Icon className={`h-4 w-4 ${meta.color}`} />
                    <span className="text-sm font-medium flex-1 truncate">{stepSummary(s)}</span>
                    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" className="h-6 w-6" disabled={i === 0} onClick={() => move(s, -1)}>
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6" disabled={i === steps.length - 1} onClick={() => move(s, 1)}>
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeStep(s)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  {s.step_type === "condition" && (
                    <p className="text-[10px] text-muted-foreground mt-1 pl-7">
                      True → {branchLabel(steps, s.next_on_true, i)} · False → {branchLabel(steps, s.next_on_false, i)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Detail editor */}
        <Card className="p-4 min-h-[300px]">
          {!selected && (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Select a step to edit its configuration.
            </div>
          )}
          {selected && (
            <StepEditor
              step={selected}
              allSteps={steps}
              members={members.data ?? []}
              onSave={saveStep}
            />
          )}
        </Card>
      </div>
    </div>
  );
}

// ---------------- helpers ----------------

function defaultConfig(t: StepType): any {
  switch (t) {
    case "condition":     return { field: "source", op: "equals", value: "" };
    case "delay":         return { amount: 1, unit: "hours" };
    case "assign":        return { assignee_id: "" };
    case "update_field":  return { field: "stage", value: "" };
    case "send_email":    return { to: "{{lead.email}}", subject: "", body: "" };
    case "send_whatsapp": return { to: "{{lead.phone}}", template: "" };
    case "send_sms":      return { to: "{{lead.phone}}", body: "" };
    case "create_task":   return { title: "", description: "", assignee_id: "" };
    case "call_webhook":  return { url: "", method: "POST", body: "" };
    case "require_approval": return { approver_id: "", message: "" };
  }
}

function stepSummary(s: Step): string {
  const c = s.config || {};
  switch (s.step_type) {
    case "condition":     return `If ${c.field ?? "?"} ${c.op ?? "?"} ${c.value ?? ""}`;
    case "delay":         return `Wait ${c.amount ?? 0} ${c.unit ?? "hours"}`;
    case "assign":        return `Assign to ${c.assignee_id ? "user" : "…"}`;
    case "update_field":  return `Set ${c.field ?? "?"} = ${c.value ?? ""}`;
    case "send_email":    return `Email: ${c.subject || "(no subject)"}`;
    case "send_whatsapp": return `WhatsApp: ${c.template || "(no template)"}`;
    case "send_sms":      return `SMS: ${(c.body ?? "").slice(0, 30) || "(empty)"}`;
    case "create_task":   return `Task: ${c.title || "(untitled)"}`;
    case "call_webhook":  return `${c.method ?? "POST"} ${c.url || "(no url)"}`;
    case "require_approval": return `Approval required`;
  }
}

function branchLabel(steps: Step[], targetId: string | null, currentIdx: number): string {
  if (!targetId) {
    const next = steps[currentIdx + 1];
    return next ? `Step ${currentIdx + 2}` : "End";
  }
  const idx = steps.findIndex((s) => s.id === targetId);
  return idx >= 0 ? `Step ${idx + 1}` : "End";
}

// ---------------- Add step menu ----------------

function AddStepMenu({ onAdd }: { onAdd: (t: StepType) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button size="sm" onClick={() => setOpen((o) => !o)}>
        <Plus className="mr-1 h-3 w-3" />Add step
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-md border bg-popover shadow-md p-1">
            {(Object.keys(STEP_META) as StepType[]).map((t) => {
              const m = STEP_META[t];
              const Icon = m.icon;
              return (
                <button
                  key={t}
                  className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted flex items-center gap-2"
                  onClick={() => { onAdd(t); setOpen(false); }}
                >
                  <Icon className={`h-4 w-4 ${m.color}`} />
                  {m.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------- Step editor forms ----------------

function StepEditor({
  step, allSteps, members, onSave,
}: {
  step: Step;
  allSteps: Step[];
  members: { id: string; full_name?: string | null; email?: string | null }[];
  onSave: (patch: Partial<Step>) => void;
}) {
  const meta = STEP_META[step.step_type];
  const Icon = meta.icon;
  const [config, setConfig] = useState<any>(step.config ?? {});
  const [nextTrue, setNextTrue] = useState<string>(step.next_on_true ?? "");
  const [nextFalse, setNextFalse] = useState<string>(step.next_on_false ?? "");

  // reset local state when switching step
  useMemo(() => {
    setConfig(step.config ?? {});
    setNextTrue(step.next_on_true ?? "");
    setNextFalse(step.next_on_false ?? "");
  }, [step.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function save() {
    onSave({
      config,
      next_on_true: nextTrue || null,
      next_on_false: nextFalse || null,
    });
    toast.success("Step saved");
  }

  const branchTargets = allSteps.filter((s) => s.id !== step.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Icon className={`h-5 w-5 ${meta.color}`} />
        <h3 className="font-semibold">{meta.label}</h3>
      </div>
      <Separator />

      {step.step_type === "condition" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Field">
            <Select value={config.field ?? ""} onValueChange={(v) => setConfig({ ...config, field: v })}>
              <SelectTrigger><SelectValue placeholder="Field" /></SelectTrigger>
              <SelectContent>{CONDITION_FIELDS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Operator">
            <Select value={config.op ?? ""} onValueChange={(v) => setConfig({ ...config, op: v })}>
              <SelectTrigger><SelectValue placeholder="Op" /></SelectTrigger>
              <SelectContent>{CONDITION_OPS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Value">
            <Input value={config.value ?? ""} disabled={config.op === "is_set" || config.op === "is_empty"}
              onChange={(e) => setConfig({ ...config, value: e.target.value })} />
          </Field>
        </div>
      )}

      {step.step_type === "delay" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount">
            <Input type="number" min={1} value={config.amount ?? 1}
              onChange={(e) => setConfig({ ...config, amount: Number(e.target.value) })} />
          </Field>
          <Field label="Unit">
            <Select value={config.unit ?? "hours"} onValueChange={(v) => setConfig({ ...config, unit: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="minutes">Minutes</SelectItem>
                <SelectItem value="hours">Hours</SelectItem>
                <SelectItem value="days">Days</SelectItem>
                <SelectItem value="weeks">Weeks</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      )}

      {(step.step_type === "assign" || step.step_type === "require_approval") && (
        <Field label={step.step_type === "assign" ? "Assignee" : "Approver"}>
          <Select
            value={step.step_type === "assign" ? (config.assignee_id ?? "") : (config.approver_id ?? "")}
            onValueChange={(v) => setConfig({ ...config, [step.step_type === "assign" ? "assignee_id" : "approver_id"]: v })}
          >
            <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.full_name ?? m.email ?? m.id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      {step.step_type === "require_approval" && (
        <Field label="Message to approver">
          <Textarea rows={3} value={config.message ?? ""}
            onChange={(e) => setConfig({ ...config, message: e.target.value })} />
        </Field>
      )}

      {step.step_type === "update_field" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Field name">
            <Input value={config.field ?? ""} onChange={(e) => setConfig({ ...config, field: e.target.value })}
              placeholder="e.g. stage" />
          </Field>
          <Field label="Value">
            <Input value={config.value ?? ""} onChange={(e) => setConfig({ ...config, value: e.target.value })}
              placeholder="new value or {{token}}" />
          </Field>
        </div>
      )}

      {step.step_type === "send_email" && (
        <>
          <Field label="To">
            <Input value={config.to ?? ""} onChange={(e) => setConfig({ ...config, to: e.target.value })} />
          </Field>
          <Field label="Subject">
            <Input value={config.subject ?? ""} onChange={(e) => setConfig({ ...config, subject: e.target.value })} />
          </Field>
          <Field label="Body">
            <Textarea rows={5} value={config.body ?? ""} onChange={(e) => setConfig({ ...config, body: e.target.value })} />
          </Field>
        </>
      )}

      {step.step_type === "send_whatsapp" && (
        <>
          <Field label="To (phone)">
            <Input value={config.to ?? ""} onChange={(e) => setConfig({ ...config, to: e.target.value })} />
          </Field>
          <Field label="Template name">
            <Input value={config.template ?? ""} onChange={(e) => setConfig({ ...config, template: e.target.value })} />
          </Field>
        </>
      )}

      {step.step_type === "send_sms" && (
        <>
          <Field label="To (phone)">
            <Input value={config.to ?? ""} onChange={(e) => setConfig({ ...config, to: e.target.value })} />
          </Field>
          <Field label="Body">
            <Textarea rows={3} value={config.body ?? ""} onChange={(e) => setConfig({ ...config, body: e.target.value })} />
          </Field>
        </>
      )}

      {step.step_type === "create_task" && (
        <>
          <Field label="Title">
            <Input value={config.title ?? ""} onChange={(e) => setConfig({ ...config, title: e.target.value })} />
          </Field>
          <Field label="Description">
            <Textarea rows={3} value={config.description ?? ""} onChange={(e) => setConfig({ ...config, description: e.target.value })} />
          </Field>
          <Field label="Assignee">
            <Select value={config.assignee_id ?? ""} onValueChange={(v) => setConfig({ ...config, assignee_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.full_name ?? m.email ?? m.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </>
      )}

      {step.step_type === "call_webhook" && (
        <>
          <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
            <Field label="Method">
              <Select value={config.method ?? "POST"} onValueChange={(v) => setConfig({ ...config, method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["GET","POST","PUT","PATCH","DELETE"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="URL">
              <Input value={config.url ?? ""} onChange={(e) => setConfig({ ...config, url: e.target.value })}
                placeholder="https://…" />
            </Field>
          </div>
          <Field label="Body (JSON)">
            <Textarea rows={5} value={config.body ?? ""} onChange={(e) => setConfig({ ...config, body: e.target.value })}
              placeholder='{"lead_id": "{{lead.id}}"}' />
          </Field>
        </>
      )}

      {step.step_type === "condition" && (
        <>
          <Separator />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="If TRUE → go to">
              <Select value={nextTrue || "__next"} onValueChange={(v) => setNextTrue(v === "__next" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__next">Next step (default)</SelectItem>
                  {branchTargets.map((s, i) => (
                    <SelectItem key={s.id} value={s.id}>
                      Step {allSteps.findIndex((x) => x.id === s.id) + 1}: {stepSummary(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="If FALSE → go to">
              <Select value={nextFalse || "__next"} onValueChange={(v) => setNextFalse(v === "__next" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__next">Next step (default)</SelectItem>
                  {branchTargets.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      Step {allSteps.findIndex((x) => x.id === s.id) + 1}: {stepSummary(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </>
      )}

      <div className="flex justify-end pt-2">
        <Button onClick={save}>Save step</Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Tokens like <code>{"{{lead.email}}"}</code>, <code>{"{{lead.phone}}"}</code>, <code>{"{{lead.name}}"}</code> are replaced at run time.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

// Re-export Link so file compiles cleanly even if unused
void Link;
