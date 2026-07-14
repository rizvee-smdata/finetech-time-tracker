import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, GitBranch, Workflow as WorkflowIcon } from "lucide-react";
import { toast } from "sonner";
import { fetchAssignableMembers } from "@/lib/crm/queries";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/admin/automations")({
  head: () => ({ meta: [{ title: "Automations — Lavisho TT" }] }),
  component: AutomationsPage,
});

function AutomationsPage() {
  const { companyId, isAdmin } = useAuth();

  if (!companyId) return <p className="p-6 text-sm text-muted-foreground">Select a company first.</p>;
  if (!isAdmin) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-border bg-card p-6">
          <h1 className="text-lg font-semibold">Admins & managers only</h1>
          <p className="mt-1 text-sm text-muted-foreground">You don't have access to this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Automations</h1>
        <p className="text-sm text-muted-foreground">Route incoming leads and orchestrate multi-step workflows.</p>
      </div>

      <Tabs defaultValue="routing">
        <TabsList>
          <TabsTrigger value="routing"><GitBranch className="mr-2 h-4 w-4" />Lead Routing</TabsTrigger>
          <TabsTrigger value="workflows"><WorkflowIcon className="mr-2 h-4 w-4" />Workflows</TabsTrigger>
        </TabsList>
        <TabsContent value="routing" className="space-y-3 mt-4"><RoutingRulesTab companyId={companyId} /></TabsContent>
        <TabsContent value="workflows" className="space-y-3 mt-4"><WorkflowsTab companyId={companyId} /></TabsContent>
      </Tabs>
    </div>
  );
}

// =========================================================
// Lead Routing Rules
// =========================================================

type Condition = { field: string; op: string; value: string };
type Rule = {
  id: string;
  company_id: string;
  name: string;
  is_active: boolean;
  priority: number;
  conditions: Condition[];
  strategy: "round_robin" | "load_balanced" | "territory" | "first";
  assignee_pool: string[];
};

const FIELDS = [
  { value: "source", label: "Source" },
  { value: "industry", label: "Industry" },
  { value: "territory_id", label: "Territory ID" },
  { value: "stage", label: "Stage" },
  { value: "country", label: "Country" },
];
const OPS = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "is_set", label: "is set" },
  { value: "is_empty", label: "is empty" },
];
const STRATEGIES = [
  { value: "round_robin", label: "Round-robin" },
  { value: "load_balanced", label: "Load-balanced (fewest open leads)" },
  { value: "territory", label: "Territory owner" },
  { value: "first", label: "First in pool" },
];

function RoutingRulesTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [editing, setEditing] = useState<Rule | null>(null);

  const rules = useQuery({
    queryKey: ["routing-rules", companyId],
    queryFn: async () => {
      const { data, error } = await sb
        .from("lead_routing_rules")
        .select("*")
        .eq("company_id", companyId)
        .order("priority")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Rule[];
    },
  });

  const members = useQuery({
    queryKey: ["assignable-members", companyId],
    queryFn: () => fetchAssignableMembers(companyId),
  });

  function newRule() {
    setEditing({
      id: "",
      company_id: companyId,
      name: "",
      is_active: true,
      priority: 100,
      conditions: [],
      strategy: "round_robin",
      assignee_pool: [],
    });
  }

  async function toggleActive(r: Rule) {
    const { error } = await sb.from("lead_routing_rules").update({ is_active: !r.is_active }).eq("id", r.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["routing-rules", companyId] });
  }

  async function remove(id: string) {
    if (!confirm("Delete this rule?")) return;
    const { error } = await sb.from("lead_routing_rules").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["routing-rules", companyId] });
  }

  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) return toast.error("Name required");
    if (!editing.assignee_pool.length) return toast.error("Add at least one assignee");
    const payload = {
      company_id: companyId,
      name: editing.name.trim(),
      is_active: editing.is_active,
      priority: editing.priority,
      conditions: editing.conditions,
      strategy: editing.strategy,
      assignee_pool: editing.assignee_pool,
      created_by: user?.id,
    };
    const op = editing.id
      ? sb.from("lead_routing_rules").update(payload).eq("id", editing.id)
      : sb.from("lead_routing_rules").insert(payload);
    const { error } = await op;
    if (error) return toast.error(error.message);
    toast.success("Rule saved");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["routing-rules", companyId] });
  }

  const memberName = (id: string) => {
    const m = (members.data ?? []).find((x) => x.id === id);
    return m ? (m.full_name ?? m.email ?? id) : id;
  };

  if (editing) {
    return (
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{editing.id ? "Edit rule" : "New routing rule"}</h3>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1 sm:col-span-2">
            <Label className="text-xs">Rule name</Label>
            <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Web leads → Dhaka team" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Priority (lower runs first)</Label>
            <Input type="number" value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: Number(e.target.value) })} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-center">
          <div className="grid gap-1">
            <Label className="text-xs">Strategy</Label>
            <Select value={editing.strategy} onValueChange={(v: any) => setEditing({ ...editing, strategy: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STRATEGIES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pt-5">
            <Switch checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} id="active" />
            <Label htmlFor="active" className="text-xs">Active</Label>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Conditions (all must match; empty = matches all leads)</Label>
            <Button size="sm" variant="outline" onClick={() => setEditing({ ...editing, conditions: [...editing.conditions, { field: "source", op: "equals", value: "" }] })}>
              <Plus className="mr-1 h-3 w-3" />Add condition
            </Button>
          </div>
          {editing.conditions.map((c, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] items-center">
              <Select value={c.field} onValueChange={(v) => {
                const cs = [...editing.conditions]; cs[i] = { ...c, field: v }; setEditing({ ...editing, conditions: cs });
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={c.op} onValueChange={(v) => {
                const cs = [...editing.conditions]; cs[i] = { ...c, op: v }; setEditing({ ...editing, conditions: cs });
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{OPS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
              <Input
                value={c.value}
                disabled={c.op === "is_set" || c.op === "is_empty"}
                onChange={(e) => {
                  const cs = [...editing.conditions]; cs[i] = { ...c, value: e.target.value }; setEditing({ ...editing, conditions: cs });
                }}
                placeholder="value"
              />
              <Button size="icon" variant="ghost" onClick={() => {
                const cs = editing.conditions.filter((_, idx) => idx !== i); setEditing({ ...editing, conditions: cs });
              }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Assignee pool</Label>
          <div className="grid gap-1 max-h-64 overflow-y-auto rounded border p-2">
            {(members.data ?? []).map((m) => {
              const checked = editing.assignee_pool.includes(m.id);
              return (
                <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 px-1 py-0.5 rounded">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const pool = e.target.checked
                        ? [...editing.assignee_pool, m.id]
                        : editing.assignee_pool.filter((x) => x !== m.id);
                      setEditing({ ...editing, assignee_pool: pool });
                    }}
                  />
                  {m.full_name ?? m.email}
                </label>
              );
            })}
            {(members.data ?? []).length === 0 && <p className="text-xs text-muted-foreground">No members available.</p>}
          </div>
          <p className="text-[11px] text-muted-foreground">Selected order does not matter — round-robin follows the database order.</p>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Routing rules</h3>
          <p className="text-xs text-muted-foreground">New leads are auto-assigned by the first matching active rule (lowest priority first).</p>
        </div>
        <Button onClick={newRule}><Plus className="mr-2 h-4 w-4" />New rule</Button>
      </Card>

      <div className="grid gap-2">
        {(rules.data ?? []).map((r) => (
          <Card key={r.id} className="p-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{r.name}</span>
                  <Badge variant="outline">priority {r.priority}</Badge>
                  <Badge variant="outline" className="capitalize">{r.strategy.replace("_", " ")}</Badge>
                  {!r.is_active && <Badge variant="secondary">Inactive</Badge>}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {r.conditions.length
                    ? r.conditions.map((c) => `${c.field} ${c.op}${c.op !== "is_set" && c.op !== "is_empty" ? " " + c.value : ""}`).join(" AND ")
                    : "matches all leads"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Pool: {r.assignee_pool.map(memberName).join(", ") || "empty"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={r.is_active} onCheckedChange={() => toggleActive(r)} />
                <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Edit</Button>
                <Button size="icon" variant="ghost" onClick={() => remove(r.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
        {(rules.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground p-4">No routing rules yet. Add your first one above — until then, new leads stay unassigned.</p>
        )}
      </div>
    </>
  );
}

// =========================================================
// Workflows (basic scaffold — full step editor coming next iteration)
// =========================================================

type Workflow = {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  is_active: boolean;
  created_at: string;
};

const TRIGGERS = [
  { value: "lead_created", label: "Lead created" },
  { value: "lead_updated", label: "Lead updated" },
  { value: "deal_stage_changed", label: "Deal stage changed" },
  { value: "visit_created", label: "Visit created" },
  { value: "schedule", label: "Schedule" },
  { value: "manual", label: "Manual" },
  { value: "webhook", label: "Webhook" },
];

function WorkflowsTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState("lead_created");

  const list = useQuery({
    queryKey: ["workflows", companyId],
    queryFn: async () => {
      const { data, error } = await sb.from("workflows").select("*").eq("company_id", companyId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Workflow[];
    },
  });

  async function create() {
    if (!name.trim()) return toast.error("Name required");
    const { error } = await sb.from("workflows").insert({
      company_id: companyId,
      name: name.trim(),
      description: description.trim() || null,
      trigger_type: triggerType,
      is_active: false,
      created_by: user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Workflow created");
    setName(""); setDescription(""); setCreating(false);
    qc.invalidateQueries({ queryKey: ["workflows", companyId] });
  }

  async function toggle(w: Workflow) {
    const { error } = await sb.from("workflows").update({ is_active: !w.is_active }).eq("id", w.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["workflows", companyId] });
  }

  async function remove(id: string) {
    if (!confirm("Delete this workflow?")) return;
    const { error } = await sb.from("workflows").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["workflows", companyId] });
  }

  return (
    <>
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Workflows</h3>
            <p className="text-xs text-muted-foreground">Multi-step automations triggered by CRM events. Visual step editor lands in the next release.</p>
          </div>
          <Button onClick={() => setCreating((c) => !c)}>
            <Plus className="mr-2 h-4 w-4" />{creating ? "Cancel" : "New workflow"}
          </Button>
        </div>

        {creating && (
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_180px_auto] items-end pt-2 border-t">
            <div className="grid gap-1">
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Hot lead follow-up" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Description</Label>
              <Textarea rows={1} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Trigger</Label>
              <Select value={triggerType} onValueChange={setTriggerType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TRIGGERS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button onClick={create}>Create</Button>
          </div>
        )}
      </Card>

      <div className="grid gap-2">
        {(list.data ?? []).map((w) => (
          <Card key={w.id} className="p-3 flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{w.name}</span>
                <Badge variant="outline" className="capitalize">{w.trigger_type.replace(/_/g, " ")}</Badge>
                {!w.is_active && <Badge variant="secondary">Inactive</Badge>}
              </div>
              {w.description && <p className="text-xs text-muted-foreground mt-1">{w.description}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={w.is_active} onCheckedChange={() => toggle(w)} />
              <Link to="/admin/automations/workflows/$id" params={{ id: w.id }}>
                <Button size="sm" variant="outline">Edit steps</Button>
              </Link>
              <Button size="icon" variant="ghost" onClick={() => remove(w.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </Card>
        ))}
        {(list.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground p-4">No workflows yet. Create one and open it to build the step sequence.</p>
        )}
      </div>

    </>
  );
}
