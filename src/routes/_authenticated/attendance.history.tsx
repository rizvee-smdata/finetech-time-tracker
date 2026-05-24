import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { STATUS_META, type AttendanceRecord } from "@/lib/attendance/types";
import { MapPin } from "lucide-react";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/attendance/history")({
  component: MyHistoryPage,
});

function MyHistoryPage() {
  const { user } = useAuth();
  const history = useQuery({
    queryKey: ["attendance-history", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<AttendanceRecord[]> => {
      const { data } = await sb.from("attendance_records")
        .select("*").eq("user_id", user!.id)
        .order("work_date", { ascending: false }).limit(60);
      return data ?? [];
    },
  });

  if (history.isLoading) return <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>;
  const rows = history.data ?? [];
  if (!rows.length) return <Card className="p-8 text-center text-sm text-muted-foreground">No attendance yet. Check in from the Today tab.</Card>;

  return (
    <Card className="divide-y">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-3 p-3 text-sm">
          <div className="w-20 shrink-0 text-xs text-muted-foreground">{format(parseISO(r.work_date), "EEE, MMM d")}</div>
          <Badge className={STATUS_META[r.status].cls + " text-[10px]"}>{STATUS_META[r.status].label}</Badge>
          <div className="flex-1 text-xs text-muted-foreground">
            {r.check_in_at ? format(new Date(r.check_in_at), "p") : "—"} → {r.check_out_at ? format(new Date(r.check_out_at), "p") : "—"}
            {r.total_minutes != null && <> · {Math.floor(r.total_minutes / 60)}h {r.total_minutes % 60}m</>}
            {r.check_in_within_geofence === false && (
              <span className="ml-1 text-amber-600"><MapPin className="inline h-3 w-3" /> outside fence</span>
            )}
          </div>
        </div>
      ))}
    </Card>
  );
}
