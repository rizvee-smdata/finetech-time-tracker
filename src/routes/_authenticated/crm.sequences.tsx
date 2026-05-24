import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Clock, Mail, MessageSquare, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const sb = supabase as any;

type Sequence = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

type Step = {
  id: string;
  sequence_id: string;
  step_order: number;
  day_offset: number;
  channel: string;
  template_id: string | null;
  subject: string | null;
  body: string | null;
};

type Template = { id: string; name: string; channel: string; subject: string | null; body: string };

export const Route = createFileRoute("/_authenticated/crm/sequences")({
  component: SequencesPage,
});

function SequencesPage() {
  const { companyId, user } = useAuth();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const sequencesQ = useQuery({
    queryKey: ["crm-sequences", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("crm_sequences")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Sequence[];
    },
  });

  const templatesQ = useQuery({
    queryKey: ["crm-templates-list", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await sb
        .from("crm_message_templates")
        .select("id,name,channel,subject,body")
        .eq("company_id", companyId)
        .eq("is_active", true);
      return (data ?? []) as Template[];
    },
  });

  const stepsQ = useQuery({
    queryKey: ["crm-seq-steps", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("crm_sequence_steps")
        .select("*")
        .eq("sequence_id", selectedId)
        .order("step_order");
      if (error) throw error;
      return (data ?? []) as Step[];
    },
  });

  if (!companyId) return <p className="text-sm text-muted-foreground">Select a company to manage sequences.</p>;

  const selected = sequencesQ.data?.find((s) => s.id === selectedId) ?? null;

  async function deleteSequence(id: string) {
    if (!confirm("Delete this sequence and all its steps?")) return;
    const { error } = await sb.from("crm_sequences").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Sequence deleted");
      if (selectedId === id) setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["crm-sequences", companyId] });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Follow-up Sequences</h2>
          <p className="text-sm text-muted-foreground">Pre-built cadences you can enroll leads into.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/crm/templates">Manage templates</Link>
          </Button>
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />New sequence
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-4">
        <div className="space-y-2">
          {(sequencesQ.data ?? []).length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">No sequences yet.</Card>
          ) : (
            (sequencesQ.data ?? []).map((s) => (
              <Card
                key={s.id}
                className={`p-3 cursor-pointer transition ${selectedId === s.id ? "border-primary" : "hover:bg-muted/40"}`}
                onClick={() => setSelectedId(s.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{s.name}</div>
                    {s.description && <div className="text-xs text-muted-foreground truncate">{s.description}</div>}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </Card>
            ))
          )}
        </div>

        <div>
          {selected ? (
            <SequenceDetail
              sequence={selected}
              steps={stepsQ.data ?? []}
              templates={templatesQ.data ?? []}
              onChange={() => qc.invalidateQueries({ queryKey: ["crm-seq-steps", selected.id] })}
              onDelete={() => deleteSequence(selected.id)}
            />
          ) : (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Select a sequence on the left to edit its steps, or create a new one.
            </Card>
          )}
        </div>
      </div>

      <SequenceDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        companyId={companyId}
        userId={user?.id ?? null}
        onCreated={(id) => {
          qc.invalidateQueries({ queryKey: ["crm-sequences", companyId] });
          setSelectedId(id);
        }}
      />
    </div>
  );
}

function SequenceDetail({
  sequence, steps, templates, onChange, onDelete,
}: {
  sequence: Sequence;
  steps: Step[];
  templates: Template[];
  onChange: () => void;
  onDelete: () => void;
}) {
  async function addStep() {
    const nextOrder = (steps[steps.length - 1]?.step_order ?? 0) + 1;
    const nextOffset = (steps[steps.length - 1]?.day_offset ?? 0) + 2;
    const { error } = await sb.from("crm_sequence_steps").insert({
      sequence_id: sequence.id,
      step_order: nextOrder,
      day_offset: nextOffset,
      channel: "email",
    });
    if (error) toast.error(error.message);
    else onChange();
  }

  async function updateStep(id: string, patch: Partial<Step>) {
    const { error } = await sb.from("crm_sequence_steps").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else onChange();
  }

  async function deleteStep(id: string) {
    const { error } = await sb.from("crm_sequence_steps").delete().eq("id", id);
    if (error) toast.error(error.message);
    else onChange();
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-lg">{sequence.name}</h3>
          {sequence.description && <p className="text-sm text-muted-foreground">{sequence.description}</p>}
        </div>
        <Button variant="ghost" size="icon" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        {steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No steps yet. Add the first touchpoint below.</p>
        ) : (
          steps.map((step, i) => (
            <Card key={step.id} className="p-3 bg-muted/30">
              <div className="flex items-start gap-3">
                <Badge variant="outline" className="shrink-0 mt-1">Step {i + 1}</Badge>
                <div className="flex-1 space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Day offset</Label>
                      <Input
                        type="number"
                        value={step.day_offset}
                        onChange={(e) => updateStep(step.id, { day_offset: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Channel</Label>
                      <Select value={step.channel} onValueChange={(v) => updateStep(step.id, { channel: v, template_id: null })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="whatsapp">WhatsApp</SelectItem>
                          <SelectItem value="sms">SMS</SelectItem>
                          <SelectItem value="call">Call</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Template</Label>
                      <Select
                        value={step.template_id ?? "none"}
                        onValueChange={(v) => updateStep(step.id, { template_id: v === "none" ? null : v })}
                      >
                        <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None / custom</SelectItem>
                          {templates.filter((t) => t.channel === step.channel).map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {!step.template_id && (
                    <>
                      {step.channel === "email" && (
                        <Input
                          placeholder="Subject (optional)"
                          value={step.subject ?? ""}
                          onChange={(e) => updateStep(step.id, { subject: e.target.value })}
                        />
                      )}
                      <Textarea
                        placeholder="Message body"
                        rows={3}
                        value={step.body ?? ""}
                        onChange={(e) => updateStep(step.id, { body: e.target.value })}
                      />
                    </>
                  )}
                </div>
                <Button variant="ghost" size="icon" onClick={() => deleteStep(step.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>

      <Button variant="outline" onClick={addStep} className="w-full">
        <Plus className="mr-2 h-4 w-4" />Add step
      </Button>
    </Card>
  );
}

function SequenceDialog({
  open, onOpenChange, companyId, userId, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  userId: string | null;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    const { data, error } = await sb
      .from("crm_sequences")
      .insert({ company_id: companyId, name: name.trim(), description: description.trim() || null, created_by: userId })
      .select("id")
      .single();
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Sequence created");
      onCreated(data.id);
      setName(""); setDescription("");
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New sequence</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cold outreach – 5 touch" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>{saving ? "Saving…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
