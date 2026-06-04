import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatBDT } from "@/lib/manager/helpers";
import { pctOf, ragOf, ragClasses, ragBar } from "@/lib/scorecard/scoring";

interface Props {
  label: string;
  actual: number;
  target: number;
  currency?: boolean;
  icon?: React.ReactNode;
}

export function KpiCard({ label, actual, target, currency, icon }: Props) {
  const pct = pctOf(actual, target);
  const rag = ragOf(pct);
  const fmt = (v: number) => (currency ? formatBDT(v) : v.toLocaleString("en-IN"));

  return (
    <Card className="p-4 print:break-inside-avoid">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {icon}
          {label}
        </div>
        <Badge variant="outline" className={cn("text-xs", ragClasses(rag))}>
          {pct}%
        </Badge>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <div className="text-3xl font-bold tabular-nums">{fmt(actual)}</div>
        <div className="text-xs text-muted-foreground">/ {fmt(target)}</div>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", ragBar(rag))}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </Card>
  );
}
