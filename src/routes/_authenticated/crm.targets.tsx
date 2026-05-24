import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { fetchCompanyMembers } from "@/lib/crm/queries";
import { formatMoney } from "@/lib/crm/types";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, parseISO } from "date-fns";
import { toast } from "sonner";
import { Plus, Target, TrendingUp } from "lucide-react";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/crm/targets")({
  component: TargetsPage,
});

type TargetRow = {
  id: string;
  user_id: string;
  target_value: number;
  currency: string;
  period_month: string; // YYYY-MM-01
};

function TargetsPage() {
  const { companyId, user, isStaff, isAdmin } = useAuth();
  const qc = useQueryClient();
  const canManage = isStaff || isAdmin;

  const now = new Date();
  const [monthOffset, setMonthOffset] = useState(0);
  const periodDate = useMemo(() => startOfMonth(addMonths(now, monthOffset)), [monthOffset, now]);
  const periodKey = format(periodDate, "yyyy-MM-01");
  const periodLabel = format(periodDate, "MMMM yyyy");

  const members = useQuery({
    queryKey: ["company-members", companyId],
    enabled: !!companyId,
    queryFn: () => fetchCompanyMembers(companyId!),
  });

  const targets = useQuery({
    queryKey: ["crm-targets", companyId, periodKey],
    enabled: !!companyId,
    queryFn: async (): Promise<TargetRow[]> => {
      const { data, error } = await sb
        .from("crm_targets")
        .select("*")
        .eq("company_id", companyId)
        .eq("period_month", periodKey);
      if (error) throw error;
      return (data ?? []) as TargetRow[];
    },
  });

  const wonLeads = useQuery({
    queryKey: ["crm-won-by-month", companyId, periodKey],
    enabled: !!companyId,
    queryFn: async () => {
      const start = periodDate.toISOString();
      const end = endOfMonth(periodDate).toISOString();
      const { data, error } = await sb
        .from("crm_leads")
        .select("assigned_to, expected_value, currency, won_at, stage")
        .eq("company_id", companyId)
        .eq("stage", "won")
        .gte("won_at", start)
        .lte("won_at", end);
      if (error) throw error;
      return (data ?? []) as { assigned_to: string | null; expected_value: number | null; won_at: string }[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (p: { user_id: string; target_value: number; currency: string }) => {
      const existing = (targets.data ?? []).find((t) => t.user_id === p.user_id);
      if (existing) {
        const { error } = await sb
          .from("crm_targets")
          .update({ target_value: p.target_value, currency: p.currency })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("crm_targets").insert({
          company_id: companyId,
          user_id: p.user_id,
          period_month: periodKey,
          target_value: p.target_value,
          currency: p.currency,
          created_by: user?.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Target saved");
      qc.invalidateQueries({ queryKey: ["crm-targets"] });
    },
    onError: (e: any) => toast.error("Failed: " + e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("crm_targets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Target removed");
      qc.invalidateQueries({ queryKey: ["crm-targets"] });
    },
  });

  // Build rows: every member, plus their target & actual
  const rows = useMemo(() => {
    const tMap = new Map((targets.data ?? []).map((t) => [t.user_id, t]));
    const wMap = new Map<string, number>();
    for (const w of wonLeads.data ?? []) {
      if (!w.assigned_to) continue;
      wMap.set(w.assigned_to, (wMap.get(w.assigned_to) ?? 0) + (Number(w.expected_value) || 0));
    }
    return (members.data ?? []).map((m: any) => {
      const t = tMap.get(m.id);
      const actual = wMap.get(m.id) ?? 0;
      const target = Number(t?.target_value ?? 0);
      const pct = target > 0 ? Math.min(100, (actual / target) * 100) : 0;
      return {
        userId: m.id,
        name: m.full_name ?? m.email ?? m.id,
        target,
        actual,
        currency: t?.currency ?? "USD",
        pct,
        targetId: t?.id,
      };
    });
  }, [members.data, targets.data, wonLeads.data]);

  const totals = useMemo(() => {
    let target = 0;
    let actual = 0;
    for (const r of rows) {
      target += r.target;
      actual += r.actual;
    }
    return { target, actual, pct: target > 0 ? Math.min(100, (actual / target) * 100) : 0 };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Targets</h1>
          <p className="text-sm text-muted-foreground">Monthly sales targets vs. closed-won revenue.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setMonthOffset((o) => o - 1)}>
            ← {format(subMonths(periodDate, 1), "MMM")}
          </Button>
          <div className="min-w-32 text-center text-sm font-medium">{periodLabel}</div>
          <Button variant="outline" size="sm" onClick={() => setMonthOffset((o) => o + 1)}>
            {format(addMonths(periodDate, 1), "MMM")} →
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Target className="size-3.5" /> Team target
          </div>
          <div className="mt-1 text-2xl font-semibold">{formatMoney(totals.target, "USD")}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <TrendingUp className="size-3.5" /> Closed-won
          </div>
          <div className="mt-1 text-2xl font-semibold text-emerald-600">{formatMoney(totals.actual, "USD")}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Attainment</div>
          <div className="mt-1 text-2xl font-semibold">{totals.pct.toFixed(0)}%</div>
          <Progress value={totals.pct} className="mt-2 h-2" />
        </Card>
      </div>

      <Card className="divide-y">
        {members.isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No team members yet.</div>
        ) : (
          rows.map((r) => (
            <div key={r.userId} className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatMoney(r.actual, r.currency)} of {formatMoney(r.target, r.currency)}
                  </div>
                </div>
                <div className="w-28 text-right text-sm font-semibold">
                  {r.target > 0 ? `${r.pct.toFixed(0)}%` : "—"}
                </div>
                {canManage && (
                  <EditTarget
                    name={r.name}
                    current={r.target}
                    currency={r.currency}
                    onSave={(v, c) => upsert.mutate({ user_id: r.userId, target_value: v, currency: c })}
                    onRemove={r.targetId ? () => remove.mutate(r.targetId!) : undefined}
                  />
                )}
              </div>
              <Progress value={r.pct} className="mt-2 h-1.5" />
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

function EditTarget({
  name,
  current,
  currency,
  onSave,
  onRemove,
}: {
  name: string;
  current: number;
  currency: string;
  onSave: (value: number, currency: string) => void;
  onRemove?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(current));
  const [cur, setCur] = useState(currency);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setValue(String(current)); setCur(currency); } }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {current > 0 ? "Edit" : <><Plus className="size-3.5" /> Set</>}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Target for {name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Monthly target</Label>
            <Input
              type="number"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label>Currency</Label>
            <Select value={cur} onValueChange={setCur}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
                <SelectItem value="INR">INR</SelectItem>
                <SelectItem value="AED">AED</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2">
          {onRemove && (
            <Button variant="ghost" className="text-rose-600 mr-auto" onClick={() => { onRemove(); setOpen(false); }}>
              Remove
            </Button>
          )}
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={() => {
              const n = Number(value);
              if (Number.isNaN(n) || n < 0) { toast.error("Enter a valid amount"); return; }
              onSave(n, cur);
              setOpen(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
