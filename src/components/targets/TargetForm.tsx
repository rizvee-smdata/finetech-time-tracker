import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { fetchCompanyMembers } from "@/lib/crm/queries";
import { supabase } from "@/integrations/supabase/client";
import { createTarget } from "@/lib/targets/queries";
import { METRIC_LABEL, METRIC_UNIT, PERIOD_LABEL, SCOPE_LABEL, periodRangeFor, type TargetMetric, type TargetPeriodKind, type TargetScope } from "@/lib/targets/types";

const sb = supabase as any;

export function NewTargetButton() {
  const { companyId, user, isStaff, isAdmin } = useAuth();
  const qc = useQueryClient();
  const canManage = isStaff || isAdmin;
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<TargetScope>("user");
  const [userId, setUserId] = useState<string>("");
  const [territoryId, setTerritoryId] = useState<string>("");
  const [metric, setMetric] = useState<TargetMetric>("revenue");
  const [periodKind, setPeriodKind] = useState<TargetPeriodKind>("monthly");
  const [periodStart, setPeriodStart] = useState(() => periodRangeFor("monthly", new Date()).start);
  const [periodEnd, setPeriodEnd] = useState(() => periodRangeFor("monthly", new Date()).end);
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const members = useQuery({
    queryKey: ["company-members", companyId],
    enabled: !!companyId && open,
    queryFn: () => fetchCompanyMembers(companyId!),
  });
  const territories = useQuery({
    queryKey: ["crm-territories", companyId],
    enabled: !!companyId && open,
    queryFn: async () => {
      const { data } = await sb.from("crm_territories").select("id,name").eq("company_id", companyId);
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  if (!canManage) return null;

  function syncPeriodFromKind(k: TargetPeriodKind) {
    setPeriodKind(k);
    if (k !== "custom") {
      const r = periodRangeFor(k, new Date(periodStart));
      setPeriodStart(r.start);
      setPeriodEnd(r.end);
    }
  }

  async function submit() {
    if (!companyId) return;
    const num = Number(value);
    if (!num || num <= 0) { toast.error("Target value must be greater than 0"); return; }
    if (scope === "user" && !userId) { toast.error("Pick a rep"); return; }
    if (scope === "territory" && !territoryId) { toast.error("Pick a territory"); return; }
    setSubmitting(true);
    try {
      await createTarget({
        company_id: companyId,
        scope,
        user_id: scope === "user" ? userId : null,
        territory_id: scope === "territory" ? territoryId : null,
        metric,
        period_kind: periodKind,
        period_start: periodStart,
        period_end: periodEnd,
        target_value: num,
        currency: "USD",
        notes: notes || null,
        created_by: user?.id ?? null,
      });
      toast.success("Target created");
      qc.invalidateQueries({ queryKey: ["targets"] });
      setOpen(false);
      setValue(""); setNotes("");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-1 h-4 w-4" />New target</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New target</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Scope</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as TargetScope)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(SCOPE_LABEL) as TargetScope[]).map((s) => (
                  <SelectItem key={s} value={s}>{SCOPE_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Metric</Label>
            <Select value={metric} onValueChange={(v) => setMetric(v as TargetMetric)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(METRIC_LABEL) as TargetMetric[]).map((m) => (
                  <SelectItem key={m} value={m}>{METRIC_LABEL[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {scope === "user" && (
            <div className="col-span-2 space-y-1">
              <Label>Rep</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger><SelectValue placeholder="Choose rep" /></SelectTrigger>
                <SelectContent>
                  {(members.data ?? []).map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name ?? m.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {scope === "territory" && (
            <div className="col-span-2 space-y-1">
              <Label>Territory</Label>
              <Select value={territoryId} onValueChange={setTerritoryId}>
                <SelectTrigger><SelectValue placeholder="Choose territory" /></SelectTrigger>
                <SelectContent>
                  {(territories.data ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label>Period</Label>
            <Select value={periodKind} onValueChange={(v) => syncPeriodFromKind(v as TargetPeriodKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(PERIOD_LABEL) as TargetPeriodKind[]).map((p) => (
                  <SelectItem key={p} value={p}>{PERIOD_LABEL[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Target value {METRIC_UNIT[metric] === "money" ? "(USD)" : "(count)"}</Label>
            <Input type="number" min={1} value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Starts</Label>
            <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} disabled={periodKind !== "custom"} />
          </div>
          <div className="space-y-1">
            <Label>Ends</Label>
            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} disabled={periodKind !== "custom"} />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional context for the rep" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>{submitting ? "Saving…" : "Create target"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
