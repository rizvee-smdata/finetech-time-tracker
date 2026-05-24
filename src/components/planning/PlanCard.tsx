import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, ListChecks } from "lucide-react";
import { format, parseISO } from "date-fns";
import { PLAN_STATUS_META, type RoutePlan } from "@/lib/planning/types";

export function PlanCard({
  plan,
  stopCount,
  doneCount,
  repName,
}: {
  plan: RoutePlan;
  stopCount: number;
  doneCount: number;
  repName?: string;
}) {
  const meta = PLAN_STATUS_META[plan.status];
  return (
    <Link to="/planning/$planId" params={{ planId: plan.id }}>
      <Card className="cursor-pointer p-4 transition hover:shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              {format(parseISO(plan.plan_date), "EEE, dd MMM yyyy")}
            </div>
            <div className="mt-1 truncate text-sm text-muted-foreground">
              {plan.title || "Untitled plan"}
              {plan.territory ? ` · ${plan.territory}` : ""}
              {repName ? ` · ${repName}` : ""}
            </div>
          </div>
          <Badge className={meta.tone} variant="outline">{meta.label}</Badge>
        </div>
        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><ListChecks className="h-3.5 w-3.5" /> {doneCount}/{stopCount} stops</span>
          {plan.start_location && <span className="inline-flex items-center gap-1 truncate"><MapPin className="h-3.5 w-3.5" /> {plan.start_location}</span>}
        </div>
      </Card>
    </Link>
  );
}
