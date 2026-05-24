import { Check } from "lucide-react";
import { DEAL_STAGES, type DealStage } from "@/lib/deals/types";
import { cn } from "@/lib/utils";

export function StageStepper({ stage }: { stage: DealStage }) {
  const idx = DEAL_STAGES.indexOf(stage);
  const stages = DEAL_STAGES.filter((s) => s !== "Closed Lost");
  const isLost = stage === "Closed Lost";

  return (
    <div className="flex w-full items-center gap-1">
      {stages.map((s, i) => {
        const active = !isLost && DEAL_STAGES.indexOf(s) === idx;
        const done = !isLost && DEAL_STAGES.indexOf(s) < idx;
        return (
          <div key={s} className="flex flex-1 items-center gap-1">
            <div
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                done
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                  : active
                    ? "border-blue-500 bg-blue-500/20 text-blue-300"
                    : "border-border bg-card text-muted-foreground",
              )}
            >
              {done ? <Check className="h-3 w-3" /> : i + 1}
            </div>
            <div
              className={cn(
                "min-w-0 truncate text-[11px] font-medium",
                active ? "text-blue-300" : done ? "text-emerald-300" : "text-muted-foreground",
              )}
            >
              {s}
            </div>
            {i < stages.length - 1 && (
              <div
                className={cn("h-px flex-1", done ? "bg-emerald-500/60" : "bg-border")}
              />
            )}
          </div>
        );
      })}
      {isLost && (
        <div className="ml-2 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-300">
          Closed Lost
        </div>
      )}
    </div>
  );
}
