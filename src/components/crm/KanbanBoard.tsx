import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { STAGES, type CrmStage, type Lead, formatMoney, stageMeta } from "@/lib/crm/types";
import { updateLeadStage } from "@/lib/crm/queries";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, User2 } from "lucide-react";
import { format } from "date-fns";

export function KanbanBoard({ leads }: { leads: Lead[] }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [dragOver, setDragOver] = useState<CrmStage | null>(null);

  const byStage = new Map<CrmStage, Lead[]>(STAGES.map((s) => [s.id, []]));
  for (const l of leads) byStage.get(l.stage)?.push(l);

  async function onDrop(stage: CrmStage, e: React.DragEvent) {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/lead-id");
    if (!id) return;
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.stage === stage) return;
    let reason: string | undefined;
    if (stage === "lost") {
      reason = window.prompt("Reason for marking as Lost?") || undefined;
    }
    try {
      await updateLeadStage(id, stage, reason);
      toast.success(`Moved to ${stageMeta(stage).label}`);
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to move");
    }
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {STAGES.map((s) => {
        const list = byStage.get(s.id) ?? [];
        const total = list.reduce((sum, l) => sum + (l.expected_value ?? 0), 0);
        return (
          <div
            key={s.id}
            onDragOver={(e) => { e.preventDefault(); setDragOver(s.id); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => onDrop(s.id, e)}
            className={cn(
              "min-w-[280px] w-[280px] flex-shrink-0 rounded-lg border bg-muted/30 transition-colors",
              dragOver === s.id && "border-primary bg-primary/5",
            )}
          >
            <div className="flex items-center justify-between border-b px-3 py-2">
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", s.color)} />
                <span className="text-sm font-semibold">{s.label}</span>
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">{list.length}</Badge>
              </div>
              <span className="text-xs text-muted-foreground">{total ? formatMoney(total) : ""}</span>
            </div>
            <div className="flex flex-col gap-2 p-2 min-h-[120px]">
              {list.map((l) => (
                <Card
                  key={l.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/lead-id", l.id)}
                  onClick={() => nav({ to: "/crm/$leadId", params: { leadId: l.id } })}
                  className="cursor-grab active:cursor-grabbing p-3 hover:border-primary/50 transition-colors"
                >
                  <div className="text-sm font-medium leading-tight">{l.customer_name}</div>
                  {l.company_name && (
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{l.company_name}</div>
                  )}
                  {l.expected_value != null && (
                    <div className="mt-2 text-xs font-semibold text-primary">
                      {formatMoney(l.expected_value, l.currency)}
                      <span className="ml-1 font-normal text-muted-foreground">· {l.probability}%</span>
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    {l.expected_close_date ? (
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(l.expected_close_date), "MMM d")}</span>
                    ) : <span />}
                    {l.assignee && (
                      <span className="flex items-center gap-1 truncate"><User2 className="h-3 w-3" />{l.assignee.full_name || l.assignee.email}</span>
                    )}
                  </div>
                </Card>
              ))}
              {list.length === 0 && (
                <div className="grid h-16 place-items-center text-xs text-muted-foreground">Drop here</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
