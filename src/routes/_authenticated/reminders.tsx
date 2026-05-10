import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, isPast } from "date-fns";

export const Route = createFileRoute("/_authenticated/reminders")({
  component: RemindersPage,
});

function RemindersPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: reminders } = useQuery({
    queryKey: ["reminders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("reminders").select("*")
        .eq("user_id", user!.id).order("remind_at", { ascending: true });
      return data ?? [];
    },
  });

  async function markRead(id: string) {
    await supabase.from("reminders").update({ read_at: new Date().toISOString() }).eq("id", id);
    qc.invalidateQueries();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reminders</h1>
        <p className="text-sm text-muted-foreground">Upcoming meetings and follow-ups.</p>
      </div>
      <div className="space-y-3">
        {(reminders ?? []).length === 0 && (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            No reminders. They'll appear here automatically before scheduled meetings.
          </Card>
        )}
        {(reminders ?? []).map((r) => (
          <Card key={r.id} className={`p-5 ${r.read_at ? "opacity-60" : ""}`}>
            <div className="flex items-start gap-4">
              <div className={`grid h-10 w-10 place-items-center rounded-full ${isPast(new Date(r.remind_at)) ? "bg-warning/20 text-warning" : "bg-primary/10 text-primary"}`}>
                <Bell className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="font-medium">{r.title}</div>
                {r.body && <div className="text-sm text-muted-foreground">{r.body}</div>}
                <div className="mt-1 text-xs text-muted-foreground">{format(new Date(r.remind_at), "PPpp")}</div>
              </div>
              {!r.read_at && (
                <Button size="sm" variant="ghost" onClick={() => markRead(r.id)}>
                  <CheckCheck className="mr-1 h-4 w-4" />Mark read
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
