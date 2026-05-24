import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ALL_CATEGORIES, CATEGORY_META, type NotificationCategory } from "@/lib/notifications/types";

export const Route = createFileRoute("/_authenticated/reminders/preferences")({
  component: PreferencesPage,
});

type ChannelMap = Partial<Record<NotificationCategory, boolean>>;
type Prefs = {
  in_app: ChannelMap;
  email: ChannelMap;
  push: ChannelMap;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
};

const DEFAULT_ON: ChannelMap = ALL_CATEGORIES.reduce((m, c) => ({ ...m, [c]: true }), {} as ChannelMap);

function PreferencesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [prefs, setPrefs] = useState<Prefs>({
    in_app: DEFAULT_ON, email: {}, push: {}, quiet_hours_start: null, quiet_hours_end: null,
  });
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ["notification-prefs", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (!data) return;
    setPrefs({
      in_app: (data.in_app as ChannelMap) ?? DEFAULT_ON,
      email: (data.email as ChannelMap) ?? {},
      push: (data.push as ChannelMap) ?? {},
      quiet_hours_start: data.quiet_hours_start ?? null,
      quiet_hours_end: data.quiet_hours_end ?? null,
    });
  }, [data]);

  function toggle(channel: "in_app" | "email" | "push", cat: NotificationCategory) {
    setPrefs((p) => ({ ...p, [channel]: { ...p[channel], [cat]: !p[channel][cat] } }));
  }

  async function save() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("notification_preferences")
      .upsert({
        user_id: user.id,
        in_app: prefs.in_app,
        email: prefs.email,
        push: prefs.push,
        quiet_hours_start: prefs.quiet_hours_start,
        quiet_hours_end: prefs.quiet_hours_end,
      }, { onConflict: "user_id" });
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Preferences saved");
      qc.invalidateQueries({ queryKey: ["notification-prefs", user.id] });
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notification channels</CardTitle>
          <CardDescription>
            Choose how you want to receive each type of signal. In-app notifications always appear in the bell;
            email and push are delivered when those services are configured.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[1fr_repeat(3,80px)] items-center gap-2 border-b pb-2 text-xs font-medium text-muted-foreground">
            <div>Category</div>
            <div className="text-center">In-app</div>
            <div className="text-center">Email</div>
            <div className="text-center">Push</div>
          </div>
          <div className="divide-y">
            {ALL_CATEGORIES.map((c) => {
              const meta = CATEGORY_META[c];
              const Icon = meta.icon;
              return (
                <div key={c} className="grid grid-cols-[1fr_repeat(3,80px)] items-center gap-2 py-2.5">
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`grid h-7 w-7 place-items-center rounded-md ${meta.tone}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {meta.label}
                  </div>
                  <div className="flex justify-center">
                    <Switch checked={!!prefs.in_app[c]} onCheckedChange={() => toggle("in_app", c)} />
                  </div>
                  <div className="flex justify-center">
                    <Switch checked={!!prefs.email[c]} onCheckedChange={() => toggle("email", c)} />
                  </div>
                  <div className="flex justify-center">
                    <Switch checked={!!prefs.push[c]} onCheckedChange={() => toggle("push", c)} />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quiet hours</CardTitle>
          <CardDescription>Suppress non-urgent notifications during this daily window (in your local time).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">From</Label>
            <Input
              type="time"
              value={prefs.quiet_hours_start ?? ""}
              onChange={(e) => setPrefs((p) => ({ ...p, quiet_hours_start: e.target.value || null }))}
            />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input
              type="time"
              value={prefs.quiet_hours_end ?? ""}
              onChange={(e) => setPrefs((p) => ({ ...p, quiet_hours_end: e.target.value || null }))}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save preferences"}</Button>
      </div>
    </div>
  );
}
