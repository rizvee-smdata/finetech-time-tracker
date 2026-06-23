import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/visits/settings")({
  component: VisitSettingsPage,
});

const TIERS = ["strategic", "standard", "low_priority"] as const;

function VisitSettingsPage() {
  const { companyId, isStaff, isAdmin } = useAuth();
  const qc = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["va-settings", companyId],
    enabled: !!companyId && isStaff,
    queryFn: async () => {
      const { data } = await supabase.from("visit_analytics_settings")
        .select("*").eq("company_id", companyId!).maybeSingle();
      return data ?? null;
    },
  });

  const { data: staffUsers = [] } = useQuery({
    queryKey: ["va-staff-users", companyId],
    enabled: !!companyId && isStaff,
    queryFn: async () => {
      const { data: members } = await supabase.from("company_members")
        .select("user_id").eq("company_id", companyId!);
      const ids = (members ?? []).map((m: any) => m.user_id);
      if (!ids.length) return [];
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email").in("id", ids),
        supabase.from("user_roles").select("user_id, role").in("user_id", ids),
      ]);
      const staffIds = new Set((roles ?? []).filter((r: any) => r.role === "admin" || r.role === "manager").map((r: any) => r.user_id));
      return (profiles ?? []).filter((p: any) => staffIds.has(p.id)) as { id: string; full_name: string | null; email: string | null }[];
    },
  });

  const [threshold, setThreshold] = useState(30);
  const [strategicTiers, setStrategicTiers] = useState<string[]>(["strategic"]);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [weeklyEnabled, setWeeklyEnabled] = useState(true);
  const [staleEnabled, setStaleEnabled] = useState(true);
  const [lowQualMin, setLowQualMin] = useState(3);
  const [repVisible, setRepVisible] = useState(false);

  useEffect(() => {
    if (settings) {
      setThreshold(settings.stale_threshold_days ?? 30);
      setStrategicTiers(settings.strategic_tiers ?? ["strategic"]);
      setRecipients(settings.weekly_report_recipients ?? []);
      setWeeklyEnabled(settings.weekly_report_enabled ?? true);
      setStaleEnabled(settings.stale_alert_enabled ?? true);
      setLowQualMin((settings as any).low_quality_min_duration_minutes ?? 3);
      setRepVisible((settings as any).integrity_visible_to_reps ?? false);
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("visit_analytics_settings").upsert({
        company_id: companyId!,
        stale_threshold_days: threshold,
        strategic_tiers: strategicTiers,
        weekly_report_recipients: recipients,
        weekly_report_enabled: weeklyEnabled,
        stale_alert_enabled: staleEnabled,
        low_quality_min_duration_minutes: lowQualMin,
        integrity_visible_to_reps: repVisible,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["va-settings"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  if (!isStaff) {
    return (
      <Card className="mx-auto mt-10 max-w-md p-6 text-center">
        <ShieldAlert className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm">Admin or manager role required.</p>
      </Card>
    );
  }

  const readOnly = !isAdmin;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Visit Analytics Settings</h1>
        <p className="text-sm text-muted-foreground">
          Control alert thresholds, what counts as a strategic account, and who receives the weekly digest.
          {readOnly && <span className="ml-2"><Badge variant="outline">Admin-only edit</Badge></span>}
        </p>
      </header>

      <Card className="space-y-4 p-4">
        <div>
          <Label htmlFor="threshold">Stale-visit threshold (days)</Label>
          <Input
            id="threshold"
            type="number"
            min={7}
            max={180}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            disabled={readOnly}
            className="mt-1 w-32"
          />
          <p className="mt-1 text-xs text-muted-foreground">An account is flagged when its last visit is older than this.</p>
        </div>

        <div>
          <Label>Tiers that count as "strategic"</Label>
          <div className="mt-2 flex flex-wrap gap-3">
            {TIERS.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm capitalize">
                <Checkbox
                  checked={strategicTiers.includes(t)}
                  disabled={readOnly}
                  onCheckedChange={(v) => {
                    setStrategicTiers(v ? [...strategicTiers, t] : strategicTiers.filter((x) => x !== t));
                  }}
                />
                {t.replace("_", " ")}
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between rounded border p-3">
          <div>
            <Label className="text-sm">Stale-account alerts</Label>
            <p className="text-xs text-muted-foreground">Daily check. Pings assigned rep + recipients below.</p>
          </div>
          <Switch checked={staleEnabled} onCheckedChange={setStaleEnabled} disabled={readOnly} />
        </div>

        <div className="flex items-center justify-between rounded border p-3">
          <div>
            <Label className="text-sm">Weekly summary digest</Label>
            <p className="text-xs text-muted-foreground">Every Monday, recipients get a reminder to review AI insights.</p>
          </div>
          <Switch checked={weeklyEnabled} onCheckedChange={setWeeklyEnabled} disabled={readOnly} />
        </div>

        <div>
          <Label>Report recipients</Label>
          <p className="mb-2 text-xs text-muted-foreground">Only admins and managers can be added.</p>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded border p-2">
            {staffUsers.length === 0 && <p className="p-2 text-xs text-muted-foreground">No eligible users.</p>}
            {staffUsers.map((u) => (
              <label key={u.id} className="flex items-center gap-2 rounded p-1.5 text-sm hover:bg-accent">
                <Checkbox
                  checked={recipients.includes(u.id)}
                  disabled={readOnly}
                  onCheckedChange={(v) => {
                    setRecipients(v ? [...recipients, u.id] : recipients.filter((x) => x !== u.id));
                  }}
                />
                <span className="font-medium">{u.full_name ?? "Unnamed"}</span>
                <span className="text-xs text-muted-foreground">{u.email}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button disabled={readOnly || save.isPending} onClick={() => save.mutate()}>
            <Save className="mr-1.5 h-4 w-4" />
            {save.isPending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </Card>

      <Card className="space-y-1 p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">How alerts work</p>
        <p>• A daily job checks strategic accounts against the threshold and creates in-app reminders for the assigned rep and all listed recipients.</p>
        <p>• Each account-alert pair is deduplicated within one threshold window so reps aren't spammed.</p>
        <p>• The Monday summary creates a reminder pointing recipients to the AI Insights panel under <span className="font-medium">Needs Attention</span>.</p>
      </Card>
    </div>
  );
}
