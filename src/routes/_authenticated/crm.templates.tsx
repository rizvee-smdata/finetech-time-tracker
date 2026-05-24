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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Mail, MessageSquare } from "lucide-react";
import { toast } from "sonner";

const sb = supabase as any;

type Template = {
  id: string;
  company_id: string;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
  is_active: boolean;
  created_at: string;
};

export const Route = createFileRoute("/_authenticated/crm/templates")({
  component: TemplatesPage,
});

function TemplatesPage() {
  const { companyId, user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);

  const templatesQ = useQuery({
    queryKey: ["crm-templates", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("crm_message_templates")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  });

  if (!companyId) return <p className="text-sm text-muted-foreground">Select a company to manage templates.</p>;

  async function remove(id: string) {
    if (!confirm("Delete this template?")) return;
    const { error } = await sb.from("crm_message_templates").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Template deleted");
      qc.invalidateQueries({ queryKey: ["crm-templates", companyId] });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Message Templates</h2>
          <p className="text-sm text-muted-foreground">Reusable email and WhatsApp templates for follow-ups.</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />New template
        </Button>
      </div>

      {(templatesQ.data ?? []).length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No templates yet. Create one to standardize your outreach.</Card>
      ) : (
        <div className="grid gap-2">
          {(templatesQ.data ?? []).map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{t.name}</span>
                    <Badge variant="outline" className="gap-1">
                      {t.channel === "email" ? <Mail className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
                      {t.channel}
                    </Badge>
                    {!t.is_active && <Badge variant="secondary">Inactive</Badge>}
                  </div>
                  {t.subject && <div className="text-sm font-medium text-muted-foreground">Subject: {t.subject}</div>}
                  <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap line-clamp-3">{t.body}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(t.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <TemplateDialog
        open={open}
        onOpenChange={setOpen}
        template={editing}
        companyId={companyId}
        userId={user?.id ?? null}
        onSaved={() => qc.invalidateQueries({ queryKey: ["crm-templates", companyId] })}
      />
    </div>
  );
}

function TemplateDialog({
  open, onOpenChange, template, companyId, userId, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  template: Template | null;
  companyId: string;
  userId: string | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [channel, setChannel] = useState(template?.channel ?? "email");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [active, setActive] = useState(template?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  // Reset on open
  useState(() => {
    setName(template?.name ?? "");
    setChannel(template?.channel ?? "email");
    setSubject(template?.subject ?? "");
    setBody(template?.body ?? "");
    setActive(template?.is_active ?? true);
  });

  async function save() {
    if (!name.trim() || !body.trim()) {
      toast.error("Name and body are required");
      return;
    }
    setSaving(true);
    const payload = {
      company_id: companyId,
      name: name.trim(),
      channel,
      subject: subject.trim() || null,
      body: body.trim(),
      is_active: active,
      created_by: userId,
    };
    const op = template
      ? sb.from("crm_message_templates").update(payload).eq("id", template.id)
      : sb.from("crm_message_templates").insert(payload);
    const { error } = await op;
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success(template ? "Template updated" : "Template created");
      onSaved();
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{template ? "Edit template" : "New template"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Follow-up #1" />
            </div>
            <div>
              <Label>Channel</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {channel === "email" && (
            <div>
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Following up on our conversation" />
            </div>
          )}
          <div>
            <Label>Body</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="Hi {{name}}, just checking in on..."
            />
            <p className="text-xs text-muted-foreground mt-1">
              Tip: use placeholders like <code>{"{{name}}"}</code>, <code>{"{{company}}"}</code> for personalization.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
