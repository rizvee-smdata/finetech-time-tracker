import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { KPI_DEFS, type KpiKey, isoDate, monthRange } from "@/lib/scorecard/scoring";

export const Route = createFileRoute("/_authenticated/scorecard/goals")({
  component: GoalsPage,
});

const METRIC_BY_KPI: Record<KpiKey, string> = {
  revenue: "revenue", deals: "won_leads", visits: "visits",
  calls: "calls", demos: "demos", proposals: "proposals",
};

function quarterStart(year: number, q: number) {
  return new Date(year, (q - 1) * 3, 1);
}
function quarterEnd(year: number, q: number) {
  return new Date(year, q * 3, 0);
}

function GoalsPage() {
  const { companyId, isStaff } = useAuth();
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string>("");
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [quarter, setQuarter] = useState<number>(Math.floor(now.getMonth() / 3) + 1);
  const [periodKind, setPeriodKind] = useState<"monthly" | "quarterly">("quarterly");
  const [monthIdx, setMonthIdx] = useState<number>(now.getMonth());

  const { start, end, label } = useMemo(() => {
    if (periodKind === "quarterly") {
      const s = quarterStart(year, quarter);
      const e = quarterEnd(year, quarter);
      return { start: s, end: e, label: `Q${quarter} ${year}` };
    }
    const ref = new Date(year, monthIdx, 1);
    const m = monthRange(ref);
    return { start: m.start, end: m.end, label: m.label };
  }, [year, quarter, periodKind, monthIdx]);

  const membersQ = useQuery({
    queryKey: ["goals-members", companyId],
    enabled: !!companyId && isStaff,
    queryFn: async () => {
      const { data: members } = await supabase
        .from("company_members").select("user_id").eq("company_id", companyId!);
      const ids = (members ?? []).map((m: any) => m.user_id);
      if (!ids.length) return [];
      const { data: profiles } = await supabase
        .from("profiles").select("id,full_name,email").in("id", ids).order("full_name");
      return profiles ?? [];
    },
  });

  const existingQ = useQuery({
    queryKey: ["goals-existing", userId, companyId, isoDate(start), isoDate(end)],
    enabled: !!userId && !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("targets").select("metric,target_value")
        .eq("company_id", companyId!).eq("user_id", userId)
        .eq("period_start", isoDate(start)).eq("period_end", isoDate(end));
      const map: Record<string, number> = {};
      for (const r of data ?? []) map[(r as any).metric] = Number((r as any).target_value);
      return map;
    },
  });

  const [values, setValues] = useState<Record<KpiKey, string>>({
    revenue: "", deals: "", visits: "", calls: "", demos: "", proposals: "",
  });

  useEffect(() => {
    if (existingQ.data) {
      setValues({
        revenue: String(existingQ.data.revenue ?? ""),
        deals: String(existingQ.data.won_leads ?? ""),
        visits: String(existingQ.data.visits ?? ""),
        calls: String(existingQ.data.calls ?? ""),
        demos: String(existingQ.data.demos ?? ""),
        proposals: String(existingQ.data.proposals ?? ""),
      });
    }
  }, [existingQ.data]);

  async function save() {
    if (!userId || !companyId) return;
    const rows = KPI_DEFS.map(d => {
      const v = Number(values[d.key] || 0);
      return {
        company_id: companyId,
        user_id: userId,
        scope: "user" as const,
        metric: METRIC_BY_KPI[d.key] as any,
        period_kind: periodKind as any,
        period_start: isoDate(start),
        period_end: isoDate(end),
        target_value: v,
        currency: "BDT",
      };
    });
    // delete existing for this period+user then insert
    const del = await supabase.from("targets").delete()
      .eq("company_id", companyId).eq("user_id", userId)
      .eq("period_start", isoDate(start)).eq("period_end", isoDate(end));
    if (del.error) { toast.error(del.error.message); return; }
    const ins = await supabase.from("targets").insert(rows);
    if (ins.error) { toast.error(ins.error.message); return; }
    toast.success("Goals saved");
    qc.invalidateQueries({ queryKey: ["goals-existing"] });
    qc.invalidateQueries({ queryKey: ["scorecard-me"] });
    qc.invalidateQueries({ queryKey: ["team-scorecard"] });
  }

  if (!isStaff) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card className="p-5">
          <h1 className="mb-2 text-xl font-semibold">Your Targets</h1>
          <p className="text-sm text-muted-foreground">Targets are set by your manager. View them on your scorecard.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Set Goals</h1>
        <p className="text-sm text-muted-foreground">Define KPI targets per rep per period.</p>
      </div>

      <Card className="space-y-4 p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Rep</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="Select rep" /></SelectTrigger>
              <SelectContent>
                {(membersQ.data ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Period</Label>
            <Select value={periodKind} onValueChange={(v) => setPeriodKind(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Year</Label>
            <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </div>
          {periodKind === "quarterly" ? (
            <div className="space-y-2">
              <Label>Quarter</Label>
              <Select value={String(quarter)} onValueChange={(v) => setQuarter(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map(q => <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Month</Label>
              <Select value={String(monthIdx)} onValueChange={(v) => setMonthIdx(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {new Date(2000, i, 1).toLocaleDateString("en-GB", { month: "long" })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="text-xs text-muted-foreground">Period: {label} ({isoDate(start)} → {isoDate(end)})</div>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-base font-semibold">KPI Targets</h2>
        {existingQ.isLoading && userId ? (
          <Skeleton className="h-32" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {KPI_DEFS.map(d => (
              <div key={d.key} className="space-y-1">
                <Label className="text-xs">{d.label} {d.currency ? "(BDT)" : ""}</Label>
                <Input
                  type="number"
                  min={0}
                  value={values[d.key]}
                  onChange={(e) => setValues(v => ({ ...v, [d.key]: e.target.value }))}
                  placeholder="0"
                />
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end">
          <Button onClick={save} disabled={!userId}>Save Goals</Button>
        </div>
      </Card>
    </div>
  );
}
