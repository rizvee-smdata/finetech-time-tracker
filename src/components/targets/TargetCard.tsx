import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { computeTargetActual, deleteTarget } from "@/lib/targets/queries";
import { METRIC_LABEL, PERIOD_LABEL, SCOPE_LABEL, formatTargetValue, type Target } from "@/lib/targets/types";
import { differenceInCalendarDays, format, parseISO } from "date-fns";

export function TargetCard({ target, assigneeName }: { target: Target; assigneeName?: string }) {
  const { isStaff, isAdmin } = useAuth();
  const qc = useQueryClient();
  const canManage = isStaff || isAdmin;

  const actual = useQuery({
    queryKey: ["target-actual", target.id, target.updated_at],
    queryFn: () => computeTargetActual(target),
  });

  const value = actual.data ?? 0;
  const pct = Math.min(100, Math.round((value / Number(target.target_value)) * 100));
  const today = new Date();
  const end = parseISO(target.period_end);
  const daysLeft = differenceInCalendarDays(end, today);
  const isOver = today > end;

  const status =
    pct >= 100 ? { label: "Achieved", cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200" }
    : isOver ? { label: "Missed", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200" }
    : pct >= 75 ? { label: "On track", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200" }
    : pct >= 40 ? { label: "Behind", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200" }
    : { label: "At risk", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200" };

  async function onDelete() {
    if (!confirm("Delete this target?")) return;
    try {
      await deleteTarget(target.id);
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["targets"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[10px]">{SCOPE_LABEL[target.scope]}</Badge>
            <Badge variant="outline" className="text-[10px]">{PERIOD_LABEL[target.period_kind]}</Badge>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${status.cls}`}>{status.label}</span>
          </div>
          <div className="mt-1 truncate text-sm font-medium">
            {assigneeName ?? (target.scope === "company" ? "Whole company" : "—")}
          </div>
          <div className="text-xs text-muted-foreground">{METRIC_LABEL[target.metric]}</div>
        </div>
        {canManage && (
          <Button variant="ghost" size="icon" onClick={onDelete} className="h-7 w-7 text-muted-foreground">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="mt-3 space-y-1">
        <div className="flex items-baseline justify-between">
          <div className="text-xl font-semibold">{formatTargetValue(target.metric, value, target.currency)}</div>
          <div className="text-xs text-muted-foreground">/ {formatTargetValue(target.metric, Number(target.target_value), target.currency)}</div>
        </div>
        <Progress value={pct} />
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{pct}% achieved</span>
          <span>
            {format(parseISO(target.period_start), "MMM d")} – {format(end, "MMM d, yyyy")} ·{" "}
            {isOver ? "ended" : `${daysLeft}d left`}
          </span>
        </div>
      </div>
      {target.notes && <div className="mt-2 text-xs text-muted-foreground">{target.notes}</div>}
    </Card>
  );
}
