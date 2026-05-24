import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Clock } from "lucide-react";
import { differenceInDays } from "date-fns";
import { HealthGauge } from "./HealthGauge";
import { formatDealValue, HEALTH_COLORS, type Deal } from "@/lib/deals/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function DealCard({ deal }: { deal: Deal }) {
  const status = deal.healthScore?.status ?? "at_risk";
  const score = deal.healthScore?.score ?? 0;
  const trend = deal.healthScore?.trend ?? "stable";
  const colors = HEALTH_COLORS[status];
  const daysSince = Math.max(0, differenceInDays(new Date(), new Date(deal.lastContactDate)));
  const topAction = deal.nextBestActions?.find((a) => !a.completed);

  const TrendIcon =
    trend === "improving" ? ArrowUpRight : trend === "declining" ? ArrowDownRight : ArrowRight;

  const isClosed = deal.stage === "Closed Won" || deal.stage === "Closed Lost";

  return (
    <div
      className={cn(
        "group rounded-lg border bg-card/50 p-3 backdrop-blur transition-all hover:bg-card/80",
        colors.border,
      )}
      style={{ boxShadow: `0 0 0 1px ${colors.hex}11, 0 4px 16px -8px ${colors.hex}22` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{deal.title}</div>
          <div className="truncate text-xs text-muted-foreground">{deal.clientCompany}</div>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
            colors.bg,
            colors.text,
          )}
        >
          <TrendIcon className="h-3 w-3" />
          {trend}
        </span>
      </div>

      <div className="my-3 flex items-center justify-center">
        <HealthGauge score={score} status={status} size={88} />
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="font-mono font-medium">{formatDealValue(deal)}</div>
        {!isClosed && (
          <div
            className={cn(
              "flex items-center gap-1",
              daysSince > 7 ? "text-red-400" : "text-muted-foreground",
            )}
          >
            <Clock className="h-3 w-3" />
            {daysSince}d
          </div>
        )}
      </div>

      {topAction && (
        <div className="mt-2 line-clamp-2 rounded-md border border-blue-500/30 bg-blue-500/10 p-2 text-[11px] text-blue-200">
          <span className="font-semibold text-blue-300">Next: </span>
          {topAction.action}
        </div>
      )}

      <Button asChild size="sm" variant="outline" className="mt-2 w-full">
        <Link to="/deals/$dealId" params={{ dealId: deal.id }}>
          View Details
        </Link>
      </Button>
    </div>
  );
}
