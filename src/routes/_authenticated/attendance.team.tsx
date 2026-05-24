import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { fetchCompanyMembers } from "@/lib/crm/queries";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { STATUS_META, type AttendanceRecord } from "@/lib/attendance/types";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/attendance/team")({
  component: TeamAttendancePage,
});

function TeamAttendancePage() {
  const { companyId } = useAuth();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const members = useQuery({
    queryKey: ["company-members", companyId],
    enabled: !!companyId,
    queryFn: () => fetchCompanyMembers(companyId!),
  });

  const records = useQuery({
    queryKey: ["attendance-team", companyId, date],
    enabled: !!companyId,
    queryFn: async (): Promise<AttendanceRecord[]> => {
      const { data } = await sb.from("attendance_records")
        .select("*").eq("company_id", companyId).eq("work_date", date);
      return data ?? [];
    },
  });

  const recordMap = useMemo(
    () => new Map((records.data ?? []).map((r) => [r.user_id, r])),
    [records.data],
  );

  const rows = (members.data ?? []).map((m: any) => ({ member: m, rec: recordMap.get(m.id) }));
  const presentCount = rows.filter((r) => r.rec?.check_in_at).length;
  const lateCount = rows.filter((r) => r.rec?.status === "late").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span><b className="text-foreground">{presentCount}</b> checked in</span>
          <span><b className="text-amber-600">{lateCount}</b> late</span>
          <span><b className="text-red-600">{rows.length - presentCount}</b> absent</span>
        </div>
      </div>
      <Card className="divide-y">
        {rows.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No team members.</div>}
        {rows.map(({ member, rec }) => (
          <div key={member.id} className="flex items-center gap-3 p-3 text-sm">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{member.full_name ?? member.email}</div>
              <div className="truncate text-[11px] text-muted-foreground">{member.email}</div>
            </div>
            {rec ? (
              <>
                <Badge className={STATUS_META[rec.status].cls + " text-[10px]"}>{STATUS_META[rec.status].label}</Badge>
                <div className="hidden w-44 text-right text-xs text-muted-foreground sm:block">
                  {rec.check_in_at ? format(new Date(rec.check_in_at), "p") : "—"} → {rec.check_out_at ? format(new Date(rec.check_out_at), "p") : "—"}
                </div>
              </>
            ) : (
              <Badge className={STATUS_META.absent.cls + " text-[10px]"}>Absent</Badge>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
