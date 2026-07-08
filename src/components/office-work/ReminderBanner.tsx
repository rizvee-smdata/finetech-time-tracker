import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { X, Bell } from "lucide-react";
import { fetchLogForDate, hourDhaka, isWorkingDay, todayDhaka } from "@/lib/officeWork/api";

const sb = supabase as any;

export function OfficeWorkReminderBanner({ onLog }: { onLog: () => void }) {
  const { user, companyId } = useAuth();
  const today = todayDhaka();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = window.localStorage.getItem("owr.dismiss");
    if (v === today) setDismissed(true);
  }, [today]);

  const shouldCheck = !!user && isWorkingDay(today) && hourDhaka() >= 16 && !dismissed;

  const q = useQuery({
    queryKey: ["office-work-reminder", user?.id, today],
    enabled: shouldCheck,
    queryFn: async () => {
      const log = await fetchLogForDate(user!.id, today);
      const startIso = `${today}T00:00:00+06:00`;
      const endIso = `${today}T23:59:59+06:00`;
      let vq = sb.from("customer_visits").select("id", { count: "exact", head: true })
        .eq("user_id", user!.id).neq("status", "office_study")
        .gte("meeting_at", startIso).lte("meeting_at", endIso);
      if (companyId) vq = vq.eq("company_id", companyId);
      const { count } = await vq;
      return { log, visitCount: count ?? 0 };
    },
  });

  if (!shouldCheck || !q.data) return null;
  const nothing = (q.data.log?.total_minutes ?? 0) === 0 && q.data.visitCount === 0;
  if (!nothing) return null;

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/50 px-3 py-2 flex items-center gap-3">
      <Bell className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <div className="flex-1 text-sm text-amber-900 dark:text-amber-100">
        Don't forget to log today's work.
      </div>
      <Button size="sm" onClick={onLog}>Log office work</Button>
      <button
        onClick={() => { window.localStorage.setItem("owr.dismiss", today); setDismissed(true); }}
        className="text-amber-700 dark:text-amber-300 hover:opacity-70"
        title="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
