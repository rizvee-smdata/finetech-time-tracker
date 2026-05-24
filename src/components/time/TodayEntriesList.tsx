import { Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TimeEntry } from "@/lib/time/types";
import { CATEGORY_COLORS } from "@/lib/time/types";

type Props = {
  entries: TimeEntry[];
  onDelete: (id: string) => void;
};

function fmtDur(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function TodayEntriesList({ entries, onDelete }: Props) {
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-border/60 bg-card/40 p-8 text-center text-sm text-muted-foreground">
        No entries logged today yet. Start the timer above.
      </div>
    );
  }
  return (
    <div className="divide-y divide-border/60 rounded-lg border border-border/60 bg-card/40">
      {entries.map((e) => (
        <div key={e.id} className="flex items-center gap-3 px-4 py-3">
          <div className="font-mono text-xs text-muted-foreground tabular-nums shrink-0 w-28">
            {e.endTime ? `${format(new Date(e.startTime), "HH:mm")} — ${format(new Date(e.endTime), "HH:mm")}` : format(new Date(e.startTime), "HH:mm")}
          </div>
          <div className="flex-1 min-w-0">
            <div className="truncate text-sm">{e.description}</div>
            <div className="mt-0.5 flex items-center gap-2 text-xs">
              <Badge variant="outline" style={{ borderColor: CATEGORY_COLORS[e.category] + "55", color: CATEGORY_COLORS[e.category] }}>
                {e.category}
              </Badge>
              {e.clientCompany && <span className="text-muted-foreground">{e.clientCompany}</span>}
            </div>
          </div>
          <div className="font-mono font-semibold text-sm tabular-nums shrink-0 w-16 text-right">
            {fmtDur(e.duration)}
          </div>
          <div className="text-sm shrink-0 w-6 text-center">
            {e.billable ? <span title="Billable">💰</span> : <span className="text-muted-foreground">—</span>}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => onDelete(e.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}
