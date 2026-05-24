import { Phone, Mail, Users, FileText, Send, ArrowUp, Sparkles } from "lucide-react";
import { format } from "date-fns";
import type { Interaction } from "@/lib/deals/types";
import { cn } from "@/lib/utils";

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  call: Phone,
  email: Mail,
  meeting: Users,
  proposal_sent: FileText,
  follow_up: Send,
  demo: Sparkles,
};

const SENT_CLS: Record<string, string> = {
  positive: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  neutral: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  negative: "bg-red-500/20 text-red-300 border-red-500/40",
};

export function InteractionTimeline({ interactions }: { interactions: Interaction[] }) {
  const sorted = [...interactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  if (sorted.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
        No interactions yet.
      </div>
    );
  }
  return (
    <div className="relative space-y-3 pl-6">
      <div className="absolute left-2.5 top-2 bottom-2 w-px bg-border" />
      {sorted.map((i) => {
        const Icon = ICON[i.type] ?? ArrowUp;
        return (
          <div key={i.id} className="relative">
            <div className="absolute -left-[18px] top-1 grid h-5 w-5 place-items-center rounded-full border border-border bg-card text-muted-foreground">
              <Icon className="h-3 w-3" />
            </div>
            <div className="rounded-lg border border-border/60 bg-card/40 p-3 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold capitalize">{i.type.replace("_", " ")}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {format(new Date(i.date), "dd MMM yyyy")}
                  </span>
                  <span className="text-[11px] text-muted-foreground">· {i.conductedBy}</span>
                </div>
                <span
                  className={cn(
                    "rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    SENT_CLS[i.sentiment],
                  )}
                >
                  {i.sentiment}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-foreground/90">{i.notes}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
