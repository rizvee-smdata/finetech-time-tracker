import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isAfter, startOfDay } from "date-fns";
import { STATUS_META, type AttendanceRecord } from "@/lib/attendance/types";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/attendance/history")({
  component: MyHistoryPage,
});

function MyHistoryPage() {
  const { user, companyId } = useAuth();
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const monthStart = startOfMonth(new Date(month + "-01"));
  const monthEnd = endOfMonth(monthStart);
  const start = format(monthStart, "yyyy-MM-dd");
  const end = format(monthEnd, "yyyy-MM-dd");

  const company = useQuery({
    queryKey: ["company-weekend", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<number[]> => {
      const { data } = await sb.from("companies").select("weekend_days").eq("id", companyId).maybeSingle();
      return (data?.weekend_days ?? [5]) as number[];
    },
  });

  const records = useQuery({
    queryKey: ["attendance-month-self", user?.id, month],
    enabled: !!user,
    queryFn: async (): Promise<AttendanceRecord[]> => {
      const { data } = await sb.from("attendance_records").select("*")
        .eq("user_id", user!.id).gte("work_date", start).lte("work_date", end)
        .order("work_date", { ascending: false });
      return data ?? [];
    },
  });

  const weekendDays = company.data ?? [5];
  const today = startOfDay(new Date());

  const rows = useMemo(() => {
    const recMap = new Map((records.data ?? []).map((r) => [r.work_date, r]));
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
      .filter((d) => !isAfter(startOfDay(d), today))
      .sort((a, b) => b.getTime() - a.getTime());
    return days.map((d) => {
      const ymd = format(d, "yyyy-MM-dd");
      const rec = recMap.get(ymd) ?? null;
      const isWeekend = weekendDays.includes(d.getDay());
      return { date: d, ymd, rec, isWeekend };
    });
  }, [records.data, weekendDays, monthStart.getTime(), monthEnd.getTime()]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Monthly log</h2>
          <p className="text-xs text-muted-foreground">Your attendance for the selected month.</p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Month</Label>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
        </div>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Date</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Check-in</th>
              <th className="px-3 py-2 text-left font-medium">Check-out</th>
              <th className="px-3 py-2 text-right font-medium">Hours</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">No data.</td></tr>
            )}
            {rows.map(({ date, ymd, rec, isWeekend }) => {
              const status = rec?.status ?? (isWeekend ? "weekend" : "absent");
              const meta = status === "weekend"
                ? { label: "Weekend", cls: "bg-muted text-muted-foreground" }
                : STATUS_META[status as keyof typeof STATUS_META];
              return (
                <tr key={ymd} className="border-t">
                  <td className="px-3 py-2 text-xs">{format(date, "EEE, MMM d")}</td>
                  <td className="px-3 py-2">
                    <Badge className={meta.cls + " text-[10px]"}>{meta.label}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs">{rec?.check_in_at ? format(new Date(rec.check_in_at), "HH:mm") : "—"}</td>
                  <td className="px-3 py-2 text-xs">{rec?.check_out_at ? format(new Date(rec.check_out_at), "HH:mm") : "—"}</td>
                  <td className="px-3 py-2 text-right text-xs">
                    {rec?.total_minutes != null ? (rec.total_minutes / 60).toFixed(2) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
