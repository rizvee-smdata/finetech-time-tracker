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
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { STAGES } from "@/lib/crm/types";
import { fetchCompanyMembers } from "@/lib/crm/queries";
import { fetchCustomFieldDefs, slugifyKey, CUSTOM_FIELD_TYPE_LABELS, type CustomFieldDef, type CustomFieldType } from "@/lib/crm/customFields";
import { fetchApprovalRule, saveApprovalRule, type ApprovalRule } from "@/lib/crm/approvals";

import { Switch } from "@/components/ui/switch";
import { format, startOfMonth, addMonths, subMonths } from "date-fns";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/crm/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { companyId } = useAuth();
  if (!companyId) return <p className="text-sm text-muted-foreground">Select a company first.</p>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">CRM Settings</h2>
        <p className="text-sm text-muted-foreground">Manage pipeline reference data and templates.</p>
      </div>

      <Tabs defaultValue="targets">
        <TabsList>
          <TabsTrigger value="targets">Targets</TabsTrigger>
          <TabsTrigger value="approvals">Quote Approvals</TabsTrigger>
          <TabsTrigger value="competitors">Competitors</TabsTrigger>
          <TabsTrigger value="templates">Document Templates</TabsTrigger>
          <TabsTrigger value="custom_fields">Custom Lead Fields</TabsTrigger>
          <TabsTrigger value="stages">Pipeline Stages</TabsTrigger>
        </TabsList>
        <TabsContent value="targets" className="space-y-3"><TargetsTab companyId={companyId} /></TabsContent>
        <TabsContent value="approvals" className="space-y-3"><ApprovalsTab companyId={companyId} /></TabsContent>
        <TabsContent value="competitors" className="space-y-3"><CompetitorsTab companyId={companyId} /></TabsContent>
        <TabsContent value="templates" className="space-y-3"><TemplatesTab companyId={companyId} /></TabsContent>
        <TabsContent value="custom_fields" className="space-y-3"><CustomFieldsTab companyId={companyId} /></TabsContent>
        <TabsContent value="stages" className="space-y-3"><StagesTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// =========================================================
function ApprovalsTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const rule = useQuery({
    queryKey: ["crm-approval-rule", companyId],
    queryFn: () => fetchApprovalRule(companyId),
  });
  const members = useQuery({
    queryKey: ["crm-members", companyId],
    queryFn: () => fetchCompanyMembers(companyId),
  });

  const [draft, setDraft] = useState<ApprovalRule | null>(null);
  const current = draft ?? rule.data ?? null;

  function patch(p: Partial<ApprovalRule>) {
    if (!current) return;
    setDraft({ ...current, ...p });
  }

  async function save() {
    if (!current) return;
    try {
      await saveApprovalRule({ ...current, company_id: companyId });
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["crm-approval-rule", companyId] });
      toast.success("Approval rules saved");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    }
  }

  if (!current) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const approvers = current.approver_ids ?? [];

  return (
    <>
      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Switch
            id="appr-enabled"
            checked={current.enabled}
            onCheckedChange={(v) => patch({ enabled: v })}
          />
          <Label htmlFor="appr-enabled" className="text-sm">Require manager approval for discounted / large quotes</Label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label className="text-xs">Discount threshold (%)</Label>
            <Input
              type="number" min={0} max={100} step="0.5"
              value={current.discount_threshold_pct}
              onChange={(e) => patch({ discount_threshold_pct: Number(e.target.value) })}
            />
            <p className="text-[11px] text-muted-foreground">Quotes with a discount at or above this need approval.</p>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Quote value threshold (optional)</Label>
            <Input
              type="number" min={0} step="100"
              placeholder="No limit"
              value={current.amount_threshold ?? ""}
              onChange={(e) => patch({ amount_threshold: e.target.value === "" ? null : Number(e.target.value) })}
            />
            <p className="text-[11px] text-muted-foreground">Quotes at or above this total also need approval.</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Designated approvers</Label>
          <p className="text-[11px] text-muted-foreground">
            If none are selected, any admin or staff manager can approve.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(members.data ?? []).map((m) => {
              const checked = approvers.includes(m.id);
              return (
                <label key={m.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={checked}
                    onChange={() =>
                      patch({
                        approver_ids: checked
                          ? approvers.filter((x: string) => x !== m.id)
                          : [...approvers, m.id],
                      })
                    }
                  />
                  <span className="truncate">{m.full_name ?? m.email}</span>
                </label>
              );
            })}
          </div>
        </div>

        <Button onClick={save} disabled={!draft}>Save approval rules</Button>
      </Card>
    </>
  );
}


// =========================================================
function TargetsTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const today = new Date();
  const [monthOffset, setMonthOffset] = useState(0);
  const period = startOfMonth(monthOffset >= 0 ? addMonths(today, monthOffset) : subMonths(today, -monthOffset));
  const periodKey = format(period, "yyyy-MM-dd");

  const members = useQuery({
    queryKey: ["crm-members", companyId],
    queryFn: () => fetchCompanyMembers(companyId),
  });

  const targets = useQuery({
    queryKey: ["crm-targets", companyId, periodKey],
    queryFn: async () => {
      const { data } = await sb.from("crm_targets").select("*")
        .eq("company_id", companyId).eq("period_month", periodKey);
      return (data ?? []) as any[];
    },
  });

  const [draft, setDraft] = useState<Record<string, string>>({});

  async function save(userId: string) {
    const raw = draft[userId];
    if (raw === undefined) return;
    const value = Number(raw);
    if (Number.isNaN(value) || value < 0) return toast.error("Enter a valid amount");
    const existing = (targets.data ?? []).find((t: any) => t.user_id === userId);
    const op = existing
      ? sb.from("crm_targets").update({ target_value: value }).eq("id", existing.id)
      : sb.from("crm_targets").insert({
          company_id: companyId, user_id: userId, period_month: periodKey,
          target_value: value, created_by: user?.id,
        });
    const { error } = await op;
    if (error) return toast.error(error.message);
    toast.success("Target saved");
    setDraft((d) => { const c = { ...d }; delete c[userId]; return c; });
    qc.invalidateQueries({ queryKey: ["crm-targets", companyId, periodKey] });
  }

  const valueFor = (uid: string) => {
    if (draft[uid] !== undefined) return draft[uid];
    const t = (targets.data ?? []).find((x: any) => x.user_id === uid);
    return t ? String(t.target_value) : "";
  };

  return (
    <>
      <Card className="p-4 flex items-center gap-2 flex-wrap">
        <Label className="text-xs">Period</Label>
        <Select value={String(monthOffset)} onValueChange={(v) => setMonthOffset(Number(v))}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[-2, -1, 0, 1, 2].map((o) => (
              <SelectItem key={o} value={String(o)}>
                {format(startOfMonth(o >= 0 ? addMonths(today, o) : subMonths(today, -o)), "MMMM yyyy")}
                {o === 0 ? " (this month)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground ml-2">Set a monthly revenue quota for each rep.</p>
      </Card>

      <div className="grid gap-2">
        {(members.data ?? []).map((m) => (
          <Card key={m.id} className="p-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="font-medium truncate">{m.full_name ?? m.email}</div>
              {m.email && m.full_name && <div className="text-xs text-muted-foreground truncate">{m.email}</div>}
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="decimal"
                className="w-36"
                placeholder="0"
                value={valueFor(m.id)}
                onChange={(e) => setDraft((d) => ({ ...d, [m.id]: e.target.value }))}
              />
              <Button size="sm" onClick={() => save(m.id)} disabled={draft[m.id] === undefined}>
                Save
              </Button>
            </div>
          </Card>
        ))}
        {(members.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No teammates yet.</p>}
      </div>
    </>
  );
}

// =========================================================
function CompetitorsTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  const list = useQuery({
    queryKey: ["crm-competitors", companyId],
    queryFn: async () => {
      const { data } = await sb.from("crm_competitors").select("*").eq("company_id", companyId).order("name");
      return data ?? [];
    },
  });

  async function add() {
    if (!name.trim()) return toast.error("Name required");
    const { error } = await sb.from("crm_competitors").insert({ company_id: companyId, name: name.trim(), notes: notes || null });
    if (error) return toast.error(error.message);
    setName(""); setNotes("");
    qc.invalidateQueries({ queryKey: ["crm-competitors", companyId] });
  }
  async function remove(id: string) {
    if (!confirm("Delete?")) return;
    const { error } = await sb.from("crm_competitors").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["crm-competitors", companyId] });
  }

  return (
    <>
      <Card className="p-4 flex flex-wrap items-end gap-2">
        <div className="grid gap-1 flex-1 min-w-[200px]">
          <Label className="text-xs">Competitor name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Co." />
        </div>
        <div className="grid gap-1 flex-1 min-w-[200px]">
          <Label className="text-xs">Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Strength / weakness" />
        </div>
        <Button onClick={add}><Plus className="mr-2 h-4 w-4" />Add</Button>
      </Card>
      <div className="grid gap-2 sm:grid-cols-2">
        {(list.data ?? []).map((c: any) => (
          <Card key={c.id} className="p-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium">{c.name}</div>
              {c.notes && <div className="text-xs text-muted-foreground mt-0.5">{c.notes}</div>}
            </div>
            <Button size="icon" variant="ghost" onClick={() => remove(c.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </Card>
        ))}
        {(list.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
      </div>
    </>
  );
}

// =========================================================
function TemplatesTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("proposal");
  const [body, setBody] = useState("");

  const list = useQuery({
    queryKey: ["crm-templates", companyId],
    queryFn: async () => {
      const { data } = await sb.from("crm_document_templates").select("*").eq("company_id", companyId).order("name");
      return data ?? [];
    },
  });

  async function add() {
    if (!name.trim() || !body.trim()) return toast.error("Name and body required");
    const { error } = await sb.from("crm_document_templates").insert({
      company_id: companyId, name: name.trim(), kind, body, created_by: user?.id,
    });
    if (error) return toast.error(error.message);
    setName(""); setBody("");
    qc.invalidateQueries({ queryKey: ["crm-templates", companyId] });
    toast.success("Template saved");
  }
  async function remove(id: string) {
    if (!confirm("Delete?")) return;
    const { error } = await sb.from("crm_document_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["crm-templates", companyId] });
  }

  return (
    <>
      <Card className="p-4 space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="grid gap-1 sm:col-span-2">
            <Label className="text-xs">Template name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard proposal" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Kind</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="proposal">Proposal</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="quote_notes">Quote notes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Body (use {`{{customer_name}}`}, {`{{amount}}`}, {`{{company}}`})</Label>
          <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <Button onClick={add}><Plus className="mr-2 h-4 w-4" />Save template</Button>
      </Card>
      <div className="space-y-2">
        {(list.data ?? []).map((t: any) => (
          <Card key={t.id} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{t.name}</span>
                  <Badge variant="outline" className="capitalize">{t.kind}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-3">{t.body}</p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove(t.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </Card>
        ))}
        {(list.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No templates yet.</p>}
      </div>
    </>
  );
}

// =========================================================
function StagesTab() {
  return (
    <Card className="p-4 space-y-3">
      <p className="text-sm text-muted-foreground">
        Pipeline stages are currently fixed. Customize order and labels per company will arrive in a later phase.
      </p>
      <div className="flex flex-wrap gap-2">
        {STAGES.map((s) => (
          <Badge key={s.id} variant="outline" className="px-3 py-1.5">
            <span className={`mr-2 inline-block h-2 w-2 rounded-full ${s.color}`} />
            {s.label}
          </Badge>
        ))}
      </div>
    </Card>
  );
}

// =========================================================
function CustomFieldsTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<CustomFieldType>("text");
  const [required, setRequired] = useState(false);
  const [optionsText, setOptionsText] = useState("");
  const needsOptions = fieldType === "select" || fieldType === "multiselect";

  const list = useQuery({
    queryKey: ["crm-custom-fields", companyId],
    queryFn: () => fetchCustomFieldDefs(companyId),
  });

  async function add() {
    const trimmed = label.trim();
    if (!trimmed) return toast.error("Label required");
    const existingKeys = new Set((list.data ?? []).map((d) => d.field_key));
    let key = slugifyKey(trimmed);
    let i = 2;
    while (existingKeys.has(key)) key = `${slugifyKey(trimmed)}_${i++}`;
    const sort_order = (list.data ?? []).length;
    const options = needsOptions
      ? optionsText
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => ({ value: l, label: l }))
      : [];
    if (needsOptions && options.length === 0) return toast.error("Add at least one dropdown option");
    const { error } = await sb.from("crm_custom_field_defs").insert({
      company_id: companyId,
      field_key: key,
      label: trimmed,
      field_type: fieldType,
      options,
      is_required: required,
      sort_order,
      created_by: user?.id,
    });
    if (error) return toast.error(error.message);
    setLabel(""); setFieldType("text"); setRequired(false); setOptionsText("");
    qc.invalidateQueries({ queryKey: ["crm-custom-fields", companyId] });
    toast.success("Custom field added");
  }

  const [editing, setEditing] = useState<CustomFieldDef | null>(null);

  async function toggleActive(f: CustomFieldDef) {
    const { error } = await sb.from("crm_custom_field_defs").update({ is_active: !f.is_active }).eq("id", f.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["crm-custom-fields", companyId] });
  }
  async function toggleRequired(f: CustomFieldDef) {
    const { error } = await sb.from("crm_custom_field_defs").update({ is_required: !f.is_required }).eq("id", f.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["crm-custom-fields", companyId] });
  }
  async function remove(id: string) {
    if (!confirm("Delete this custom field? Existing lead values will remain in the database but be hidden.")) return;
    const { error } = await sb.from("crm_custom_field_defs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["crm-custom-fields", companyId] });
  }

  return (
    <>
      <Card className="p-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          Add custom fields to this company's lead form. Fields appear on the New Lead / Edit Lead dialog for everyone in this company.
        </p>
        <div className="grid gap-2 sm:grid-cols-[1fr_140px_120px_auto] items-end">
          <div className="grid gap-1">
            <Label className="text-xs">Field label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Tender Reference, Budget Code" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Type</Label>
            <Select value={fieldType} onValueChange={(v) => setFieldType(v as CustomFieldType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(CUSTOM_FIELD_TYPE_LABELS) as CustomFieldType[]).map((t) => (
                  <SelectItem key={t} value={t}>{CUSTOM_FIELD_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch checked={required} onCheckedChange={setRequired} id="req" />
            <Label htmlFor="req" className="text-xs">Required</Label>
          </div>
          <Button onClick={add}><Plus className="mr-2 h-4 w-4" />Add field</Button>
        </div>
        {needsOptions && (
          <div className="grid gap-1">
            <Label className="text-xs">Dropdown options (one per line)</Label>
            <Textarea
              rows={4}
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder={"Government\nPrivate\nNGO"}
            />
          </div>
        )}
      </Card>

      <div className="space-y-2">
        {(list.data ?? []).map((f) => (
          <Card key={f.id} className="p-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{f.label}</span>
                <Badge variant="outline" className="capitalize">
                  {CUSTOM_FIELD_TYPE_LABELS[f.field_type] ?? f.field_type}
                </Badge>
                {!f.is_active && <Badge variant="secondary">Inactive</Badge>}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">key: <code>{f.field_key}</code></div>
              {(f.field_type === "select" || f.field_type === "multiselect") && (
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  {(f.options ?? []).map((o) => (
                    <Badge key={o.value} variant="secondary" className="text-[10px]">{o.label}</Badge>
                  ))}
                  <Button size="sm" variant="link" className="h-auto p-0 text-[11px]" onClick={() => editOptions(f)}>
                    Edit options
                  </Button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch checked={f.is_required} onCheckedChange={() => toggleRequired(f)} id={`req-${f.id}`} />
                <Label htmlFor={`req-${f.id}`} className="text-xs">Required</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={f.is_active} onCheckedChange={() => toggleActive(f)} id={`act-${f.id}`} />
                <Label htmlFor={`act-${f.id}`} className="text-xs">Active</Label>
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove(f.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </Card>
        ))}
        {(list.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No custom fields yet. Add your first one above.</p>
        )}
      </div>
    </>
  );
}
