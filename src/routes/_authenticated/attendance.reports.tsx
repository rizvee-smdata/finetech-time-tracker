import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { fetchCompanyMembers } from "@/lib/crm/queries";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { STATUS_META, type AttendanceRecord } from "@/lib/attendance/types";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/attendance/reports")({
  component: AttendanceReportsPage,
});

function AttendanceReportsPage() {
  const { companyId } = useAuth();
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const start = format(startOfMonth(new Date(month + "-01")), "yyyy-MM-dd");
  const end = format(endOfMonth(new Date(month + "-01")), "yyyy-MM-dd");

  const members = useQuery({
    queryKey: ["company-members", companyId],
    enabled: !!companyId,
    queryFn: () => fetchCompanyMembers(companyId!),
  });

  const records = useQuery({
    queryKey: ["attendance-month", companyId, month],
    enabled: !!companyId,
    queryFn: async (): Promise<AttendanceRecord[]> => {
      const { data } = await sb.from("attendance_records").select("*")
        .eq("company_id", companyId).gte("work_date", start).lte("work_date", end);
      return data ?? [];
    },
  });

  const perUser = useMemo(() => {
    const map = new Map<string, { present: number; late: number; halfDay: number; leave: number; minutes: number }>();
    for (const r of records.data ?? []) {
      const cur = map.get(r.user_id) ?? { present: 0, late: 0, halfDay: 0, leave: 0, minutes: 0 };
      if (r.status === "present") cur.present++;
      else if (r.status === "late") cur.late++;
      else if (r.status === "half_day") cur.halfDay++;
      else if (r.status === "leave") cur.leave++;
      cur.minutes += r.total_minutes ?? 0;
      map.set(r.user_id, cur);
    }
    return map;
  }, [records.data]);

  function exportCsv() {
    const header = ["Name", "Email", "Present", "Late", "Half day", "Leave", "Hours worked"];
    const rows = (members.data ?? []).map((m: any) => {
      const s = perUser.get(m.id) ?? { present: 0, late: 0, halfDay: 0, leave: 0, minutes: 0 };
      return [m.full_name ?? "", m.email ?? "", s.present, s.late, s.halfDay, s.leave, (s.minutes / 60).toFixed(1)];
    });
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `attendance-${month}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Month</Label>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv}><Download className="mr-1.5 h-4 w-4" />Export CSV</Button>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Rep</th>
              <th className="px-3 py-2 text-right font-medium">{STATUS_META.present.label}</th>
              <th className="px-3 py-2 text-right font-medium">{STATUS_META.late.label}</th>
              <th className="px-3 py-2 text-right font-medium">{STATUS_META.half_day.label}</th>
              <th className="px-3 py-2 text-right font-medium">{STATUS_META.leave.label}</th>
              <th className="px-3 py-2 text-right font-medium">Hours</th>
            </tr>
          </thead>
          <tbody>
            {(members.data ?? []).map((m: any) => {
              const s = perUser.get(m.id) ?? { present: 0, late: 0, halfDay: 0, leave: 0, minutes: 0 };
              return (
                <tr key={m.id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium">{m.full_name ?? m.email}</div>
                    <div className="text-[11px] text-muted-foreground">{m.email}</div>
                  </td>
                  <td className="px-3 py-2 text-right">{s.present}</td>
                  <td className="px-3 py-2 text-right text-amber-600">{s.late}</td>
                  <td className="px-3 py-2 text-right">{s.halfDay}</td>
                  <td className="px-3 py-2 text-right">{s.leave}</td>
                  <td className="px-3 py-2 text-right">{(s.minutes / 60).toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
