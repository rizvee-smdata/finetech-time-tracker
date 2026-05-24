import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Flame } from "lucide-react";
import { scoreLead, BAND_META } from "@/lib/crm/scoring";
import type { Database } from "@/integrations/supabase/types";

type Lead = Database["public"]["Tables"]["crm_leads"]["Row"];

export function LeadScoreCard({ lead, activityCount }: { lead: Lead; activityCount: number }) {
  const scored = scoreLead(lead, activityCount);
  const meta = BAND_META[scored.scoreBand];

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Lead Score</span>
        </div>
        <Badge variant="outline" className={meta.color}>{meta.label}</Badge>
      </div>
      <div className="flex items-end gap-3">
        <div className="text-4xl font-bold leading-none">{scored.score}</div>
        <div className="text-xs text-muted-foreground pb-1">/ 100</div>
      </div>
      <Progress value={scored.score} className="h-2" />
      <div className="space-y-1">
        {scored.scoreFactors.map((f, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{f.label}</span>
            <span className={f.value >= 0 ? "text-emerald-600 font-medium" : "text-destructive font-medium"}>
              {f.value >= 0 ? "+" : ""}{f.value}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
