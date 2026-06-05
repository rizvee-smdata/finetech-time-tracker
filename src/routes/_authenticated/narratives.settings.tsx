import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { listSettings, upsertSettings } from "@/lib/narratives/api";
import { DEFAULT_ROLE_PROMPTS, ROLE_LABEL, type NarrativeChannel, type NarrativeLanguage, type NarrativeRole, type NarrativeSettingsRow } from "@/lib/narratives/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/narratives/settings")({
  component: NarrativesSettingsPage,
});

const ROLES: NarrativeRole[] = ["ceo", "sales", "ops", "custom"];
const CHANNELS: NarrativeChannel[] = ["in_app", "whatsapp", "email"];

type Draft = Omit<NarrativeSettingsRow, "id" | "company_id" | "role" | "created_at" | "updated_at">;

function defaultDraft(role: NarrativeRole): Draft {
  return {
    enabled: true,
    role_description: DEFAULT_ROLE_PROMPTS[role],
    channels: ["in_app"],
    delivery_time: "07:00",
    language: "en",
    custom_kpis: [],
    whatsapp_recipients: [],
    email_recipients: [],
  };
}

function NarrativesSettingsPage() {
  const { companyId, isStaff } = useAuth();
  const [drafts, setDrafts] = useState<Record<NarrativeRole, Draft>>(() => ({
    ceo: defaultDraft("ceo"), sales: defaultDraft("sales"), ops: defaultDraft("ops"), custom: defaultDraft("custom"),
  }));
  const [saving, setSaving] = useState<NarrativeRole | null>(null);

  useEffect(() => {
    if (!companyId) return;
    listSettings(companyId).then((rows) => {
      const next = { ...drafts };
      for (const r of rows) {
        next[r.role] = {
          enabled: r.enabled, role_description: r.role_description || DEFAULT_ROLE_PROMPTS[r.role],
          channels: r.channels as NarrativeChannel[], delivery_time: r.delivery_time,
          language: r.language, custom_kpis: r.custom_kpis || [],
          whatsapp_recipients: r.whatsapp_recipients || [], email_recipients: r.email_recipients || [],
        };
      }
      setDrafts(next);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  if (!isStaff) {
    return <div className="mx-auto max-w-3xl p-10 text-sm text-muted-foreground">Admin / manager access required.</div>;
  }

  function update(role: NarrativeRole, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [role]: { ...d[role], ...patch } }));
  }

  function toggleChannel(role: NarrativeRole, ch: NarrativeChannel) {
    const cur = drafts[role].channels;
    update(role, { channels: cur.includes(ch) ? cur.filter((c) => c !== ch) : [...cur, ch] });
  }

  async function save(role: NarrativeRole) {
    if (!companyId) return;
    setSaving(role);
    try {
      await upsertSettings(companyId, role, drafts[role]);
      toast.success(`${ROLE_LABEL[role]} saved`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/narratives"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link>
        </Button>
      </div>
      <div>
        <h1 className="font-serif text-3xl font-semibold">Narrative Settings</h1>
        <p className="text-sm text-muted-foreground">Configure how each weekly executive briefing is generated and delivered.</p>
      </div>

      {ROLES.map((role) => {
        const d = drafts[role];
        return (
          <Card key={role} className="space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Badge variant="secondary" className="rounded-sm uppercase">{ROLE_LABEL[role]}</Badge>
                <h2 className="mt-1 font-serif text-xl">{ROLE_LABEL[role]}</h2>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Enabled</Label>
                <Switch checked={d.enabled} onCheckedChange={(v) => update(role, { enabled: v })} />
              </div>
            </div>

            <div>
              <Label className="text-xs">AI role description (system prompt)</Label>
              <Textarea
                rows={5} value={d.role_description}
                onChange={(e) => update(role, { role_description: e.target.value })}
                className="font-mono text-xs"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label className="text-xs">Delivery time (Asia/Dhaka)</Label>
                <Input type="time" value={d.delivery_time} onChange={(e) => update(role, { delivery_time: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Language</Label>
                <Select value={d.language} onValueChange={(v) => update(role, { language: v as NarrativeLanguage })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="bn">Bangla</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Channels</Label>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {CHANNELS.map((c) => (
                    <Button key={c} type="button" size="sm"
                      variant={d.channels.includes(c) ? "default" : "outline"}
                      onClick={() => toggleChannel(role, c)}>
                      {c.replace("_", " ")}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label className="text-xs">Custom KPIs (comma-separated)</Label>
                <Input
                  value={d.custom_kpis.join(", ")}
                  onChange={(e) => update(role, { custom_kpis: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  placeholder="e.g. SmartData renewals, partner co-sell"
                />
              </div>
              <div>
                <Label className="text-xs">WhatsApp recipients</Label>
                <Input
                  value={d.whatsapp_recipients.join(", ")}
                  onChange={(e) => update(role, { whatsapp_recipients: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  placeholder="01712345678, 01898765432"
                />
              </div>
              <div>
                <Label className="text-xs">Email recipients</Label>
                <Input
                  value={d.email_recipients.join(", ")}
                  onChange={(e) => update(role, { email_recipients: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  placeholder="ceo@company.com"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => save(role)} disabled={saving === role}>
                <Save className="mr-2 h-4 w-4" /> {saving === role ? "Saving…" : "Save"}
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
