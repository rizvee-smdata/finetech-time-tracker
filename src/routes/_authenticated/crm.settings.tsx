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
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { STAGES } from "@/lib/crm/types";
import { fetchCompanyMembers } from "@/lib/crm/queries";
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
          <TabsTrigger value="competitors">Competitors</TabsTrigger>
          <TabsTrigger value="templates">Document Templates</TabsTrigger>
          <TabsTrigger value="stages">Pipeline Stages</TabsTrigger>
        </TabsList>
        <TabsContent value="targets" className="space-y-3"><TargetsTab companyId={companyId} /></TabsContent>
        <TabsContent value="competitors" className="space-y-3"><CompetitorsTab companyId={companyId} /></TabsContent>
        <TabsContent value="templates" className="space-y-3"><TemplatesTab companyId={companyId} /></TabsContent>
        <TabsContent value="stages" className="space-y-3"><StagesTab /></TabsContent>
      </Tabs>
    </div>
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
