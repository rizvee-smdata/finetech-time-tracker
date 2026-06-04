import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ClipboardList, X } from "lucide-react";

export function VisitEntryAlertBanner() {
  const { user, ready } = useAuth();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["visit-reminder-banner", user?.id],
    enabled: ready && !!user,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      if (!user) return [];
      const { data: rows } = await supabase
        .from("visit_reminder_log")
        .select("id, target_date, channel, created_at")
        .eq("user_id", user.id)
        .is("resolved_at", null)
        .order("target_date", { ascending: false })
        .limit(5);
      return rows ?? [];
    },
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from("visit_reminder_log")
        .update({ resolved_at: new Date().toISOString() })
        .eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visit-reminder-banner"] }),
  });

  if (!data || data.length === 0) return null;

  // Group by target_date — one banner per missed day
  const byDate = new Map<string, { id: string; channel: string }[]>();
  for (const r of data) {
    const arr = byDate.get(r.target_date) ?? [];
    arr.push({ id: r.id, channel: r.channel });
    byDate.set(r.target_date, arr);
  }

  return (
    <div className="mb-4 space-y-2">
      {Array.from(byDate.entries()).map(([date, items]) => (
        <div
          key={date}
          className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <div className="font-medium">Visit entries missing for {date}</div>
              <div className="text-muted-foreground">
                Please log the customer visits you made on {date}.
                {items.some((i) => i.channel === "evening") && (
                  <span className="ml-1 font-medium text-destructive">
                    Final reminder.
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button asChild size="sm">
              <Link to="/visits/new">
                <ClipboardList className="mr-1.5 h-4 w-4" /> Add visit
              </Link>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => items.forEach((i) => dismiss.mutate(i.id))}
              disabled={dismiss.isPending}
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
