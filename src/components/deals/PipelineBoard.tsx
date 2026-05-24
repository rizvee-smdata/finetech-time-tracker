import { DEAL_STAGES, type Deal } from "@/lib/deals/types";
import { DealCard } from "./DealCard";

export function PipelineBoard({ deals }: { deals: Deal[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {DEAL_STAGES.map((stage) => {
        const list = deals.filter((d) => d.stage === stage);
        const total = list.reduce((s, d) => s + (d.dealValue || 0), 0);
        return (
          <div key={stage} className="flex min-h-[200px] flex-col gap-3 rounded-lg border border-border/60 bg-card/30 p-3 backdrop-blur">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {stage}
              </div>
              <div className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
                {list.length}
              </div>
            </div>
            <div className="font-mono text-[11px] text-muted-foreground">
              {total > 0 ? total.toLocaleString() : "—"}
            </div>
            <div className="flex flex-col gap-2">
              {list.map((d) => (
                <DealCard key={d.id} deal={d} />
              ))}
              {list.length === 0 && (
                <div className="rounded-md border border-dashed border-border/60 p-3 text-center text-xs text-muted-foreground">
                  No deals
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
