import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { Plus, BookOpen } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { fetchLogForDate, formatHm, todayDhaka } from "@/lib/officeWork/api";

const sb = supabase as any;

export function MyDayStrip({ onLogOffice }: { onLogOffice: () => void }) {
  const { user, companyId } = useAuth();
  const today = todayDhaka();

  const my = useQuery({
    queryKey: ["office-work-my-day", user?.id, today],
    enabled: !!user,
    queryFn: async () => {
      const log = await fetchLogForDate(user!.id, today);
      // Count visits for today
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

  const totalMin = my.data?.log?.total_minutes ?? 0;
  const visitCount = my.data?.visitCount ?? 0;
  const targetMin = 480;
  const pct = Math.min(100, Math.round((totalMin / targetMin) * 100));
  const nothingLogged = totalMin === 0 && visitCount === 0;

  return (
    <Card className="p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm">
          <div className="font-medium">{format(new Date(`${today}T12:00:00+06:00`), "EEEE, MMM d")}</div>
          <div className="text-xs text-muted-foreground">
            {formatHm(totalMin)} office work · {visitCount} visit{visitCount === 1 ? "" : "s"} today
          </div>
        </div>
        <div className="flex-1 min-w-[160px]">
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">Target: 8h</div>
        </div>
        {nothingLogged ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Nothing logged for today yet</span>
            <Button size="sm" variant="outline" onClick={onLogOffice}>
              <BookOpen className="mr-1 h-4 w-4" /> Log office work
            </Button>
            <Button size="sm" asChild>
              <Link to="/visits/new"><Plus className="mr-1 h-4 w-4" /> New visit</Link>
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={onLogOffice}>
            <BookOpen className="mr-1 h-4 w-4" /> {totalMin > 0 ? "Edit today" : "Log office work"}
          </Button>
        )}
      </div>
    </Card>
  );
}
