import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Settings as SettingsIcon, Save, ShieldAlert, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/followups/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { companyId, isStaff } = useAuth();
  const qc = useQueryClient();
  const [inactivity, setInactivity] = useState(7);
  const [highValue, setHighValue] = useState(100000);
  const [boost, setBoost] = useState(25);
  const [defaultChannel, setDefaultChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [blackoutInput, setBlackoutInput] = useState("");
  const [blackouts, setBlackouts] = useState<string[]>([]);
  const [templates, setTemplates] = useState<string>("{}");

  const { data: settings } = useQuery({
    queryKey: ["followup-settings", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase.from("followup_settings").select("*").eq("company_id", companyId!).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (!settings) return;
    setInactivity(settings.inactivity_threshold_days ?? 7);
    setHighValue(Number(settings.high_value_threshold ?? 100000));
    setBoost(settings.high_value_boost ?? 25);
    setDefaultChannel(((settings.default_channel ?? "whatsapp") as any));
    setBlackouts(settings.blackout_dates ?? []);
    setTemplates(JSON.stringify(settings.industry_templates ?? {}, null, 2));
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("No company");
      let parsedTemplates: any = {};
      try { parsedTemplates = JSON.parse(templates || "{}"); }
      catch { throw new Error("Templates must be valid JSON"); }
      const payload = {
        company_id: companyId,
        inactivity_threshold_days: inactivity,
        high_value_threshold: highValue,
        high_value_boost: boost,
        default_channel: defaultChannel,
        blackout_dates: blackouts,
        industry_templates: parsedTemplates,
      };
      const { error } = await supabase.from("followup_settings").upsert(payload as any, { onConflict: "company_id" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["followup-settings"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  if (!isStaff) {
    return (
      <Card className="m-6 p-8 text-center">
        <ShieldAlert className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p>Manager access required.</p>
      </Card>
    );
  }

  return (
    <div className="container mx-auto py-6 max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-primary" /> Follow-up Rules
        </h1>
        <p className="text-muted-foreground text-sm">Tune how priorities and reminders are computed for your team.</p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Inactivity threshold (days)</Label>
            <Input type="number" min={1} value={inactivity} onChange={(e) => setInactivity(Number(e.target.value))} />
            <p className="text-xs text-muted-foreground mt-1">Contacts with no activity past this many days surface as follow-ups.</p>
          </div>
          <div>
            <Label>Default channel</Label>
            <Select value={defaultChannel} onValueChange={(v) => setDefaultChannel(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>High-value deal threshold (BDT)</Label>
            <Input type="number" min={0} value={highValue} onChange={(e) => setHighValue(Number(e.target.value))} />
          </div>
          <div>
            <Label>Priority boost for high-value (+points)</Label>
            <Input type="number" min={0} max={50} value={boost} onChange={(e) => setBoost(Number(e.target.value))} />
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div>
          <Label>Blackout days (BD holidays — no follow-ups)</Label>
          <div className="flex gap-2 mt-1">
            <Input type="date" value={blackoutInput} onChange={(e) => setBlackoutInput(e.target.value)} />
            <Button type="button" variant="outline" onClick={() => {
              if (!blackoutInput) return;
              if (blackouts.includes(blackoutInput)) return;
              setBlackouts([...blackouts, blackoutInput].sort());
              setBlackoutInput("");
            }}>Add</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {blackouts.length === 0 && <p className="text-xs text-muted-foreground">No blackout days set.</p>}
          {blackouts.map((d) => (
            <span key={d} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted text-xs">
              {d}
              <button onClick={() => setBlackouts(blackouts.filter((x) => x !== d))} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      </Card>

      <Card className="p-5 space-y-2">
        <Label>Default message templates per industry (JSON)</Label>
        <Textarea rows={8} className="font-mono text-xs" value={templates} onChange={(e) => setTemplates(e.target.value)}
          placeholder={`{\n  "banking": "Hi {name}, checking in on the cybersecurity proposal we discussed…",\n  "telecom": "Hi {name}, …"\n}`} />
        <p className="text-xs text-muted-foreground">Used as starting text when the AI is unavailable. Use {"{name}"} and {"{company}"} as placeholders.</p>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="h-4 w-4 mr-2" /> {save.isPending ? "Saving…" : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
