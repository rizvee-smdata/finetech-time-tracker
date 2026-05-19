import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const CATEGORIES: Array<{ key: string; label: string; description: string }> = [
  { key: "task_assigned", label: "Task assigned to me", description: "When someone assigns you to a task." },
  { key: "task_comment", label: "New comment on my task", description: "When someone comments on a task you're on." },
  { key: "task_overdue", label: "Task overdue reminders", description: "Hourly check on missed due dates." },
  { key: "task_due_soon", label: "Due soon", description: "24h / 48h before a due date." },
  { key: "sprint_milestone", label: "Sprint & milestone events", description: "Sprint started/closed, milestone reached." },
  { key: "mention", label: "Mentions", description: "When you're @mentioned in a comment." },
];

type Pref = { category: string; in_app: boolean; email: boolean };

export function NotificationPrefsTab() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const prefs = useQuery({
    queryKey: ["tms-notif-prefs", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tms_notification_prefs")
        .select("category, in_app, email")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []) as Pref[];
    },
  });

  const mutate = useMutation({
    mutationFn: async ({ category, channel, value }: { category: string; channel: "in_app" | "email"; value: boolean }) => {
      const existing = (prefs.data ?? []).find((p) => p.category === category);
      const row = {
        user_id: user!.id,
        category,
        in_app: channel === "in_app" ? value : existing?.in_app ?? true,
        email: channel === "email" ? value : existing?.email ?? false,
      };
      const { error } = await supabase
        .from("tms_notification_prefs")
        .upsert(row, { onConflict: "user_id,category" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tms-notif-prefs"] });
      toast.success("Preference updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const get = (cat: string) => (prefs.data ?? []).find((p) => p.category === cat);

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h3 className="font-semibold">Task notifications</h3>
        <p className="text-sm text-muted-foreground">Pick how you want to be alerted for each Tasks event.</p>
      </div>
      {prefs.isLoading ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="divide-y">
          <div className="hidden md:grid grid-cols-[1fr_80px_80px] gap-4 pb-2 text-xs text-muted-foreground">
            <div>Event</div>
            <div className="text-center">In-app</div>
            <div className="text-center">Email</div>
          </div>
          {CATEGORIES.map((c) => {
            const p = get(c.key);
            const inApp = p?.in_app ?? true;
            const email = p?.email ?? false;
            return (
              <div key={c.key} className="grid md:grid-cols-[1fr_80px_80px] items-center gap-4 py-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">{c.label}</Label>
                  <p className="text-xs text-muted-foreground">{c.description}</p>
                </div>
                <div className="flex justify-center">
                  <Switch
                    checked={inApp}
                    onCheckedChange={(v) => mutate.mutate({ category: c.key, channel: "in_app", value: v })}
                  />
                </div>
                <div className="flex justify-center">
                  <Switch
                    checked={email}
                    onCheckedChange={(v) => mutate.mutate({ category: c.key, channel: "email", value: v })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
