import { useState } from "react";
import {
  Check,
  Copy,
  Mail,
  Phone,
  Users,
  FileText,
  ArrowUp,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Play,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import type { NextBestAction } from "@/lib/deals/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTimeStore } from "@/lib/time/storage";

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  call: Phone,
  email: Mail,
  meeting: Users,
  proposal: FileText,
  escalate: ArrowUp,
  demo: Sparkles,
};

const URGENCY_LABEL: Record<string, { label: string; cls: string }> = {
  today: { label: "TODAY", cls: "bg-red-500/20 text-red-300 border-red-500/40" },
  this_week: { label: "THIS WEEK", cls: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
  this_month: { label: "THIS MONTH", cls: "bg-blue-500/20 text-blue-300 border-blue-500/40" },
};

const IMPACT_LABEL: Record<string, { label: string; cls: string }> = {
  high: { label: "HIGH IMPACT", cls: "bg-emerald-500/20 text-emerald-300" },
  medium: { label: "MED IMPACT", cls: "bg-amber-500/20 text-amber-300" },
  low: { label: "LOW IMPACT", cls: "bg-muted text-muted-foreground" },
};

const PRIORITY_CLS: Record<number, string> = {
  1: "bg-red-500 text-white",
  2: "bg-amber-500 text-white",
  3: "bg-blue-500 text-white",
};

type Props = {
  action: NextBestAction;
  onToggle: () => void;
  onUpdateDraft?: (draft: string) => void;
  dealLabel?: string;
};

export function NextBestActionCard({ action, onToggle, onUpdateDraft, dealLabel }: Props) {
  const Icon = TYPE_ICON[action.actionType] ?? Sparkles;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(action.draftContent ?? "");
  const navigate = useNavigate();
  const { startTimer } = useTimeStore();

  const onStartTimer = () => {
    const cat =
      action.actionType === "meeting" || action.actionType === "demo"
        ? "Client Meeting"
        : action.actionType === "proposal"
        ? "Proposal Writing"
        : action.actionType === "call" || action.actionType === "email"
        ? "Follow-up"
        : "Business Development";
    startTimer(action.action, { category: cat, billable: true });
    toast.success("Timer started");
    navigate({ to: "/time" });
  };


  return (
    <div
      className={cn(
        "rounded-lg border border-blue-500/30 bg-card/40 p-4 backdrop-blur transition-all",
        action.completed && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold",
            PRIORITY_CLS[action.priority],
          )}
        >
          {action.priority}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="grid h-6 w-6 place-items-center rounded-md bg-blue-500/20 text-blue-300">
              <Icon className="h-3.5 w-3.5" />
            </div>
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 text-[10px] font-bold tracking-wider",
                URGENCY_LABEL[action.urgency].cls,
              )}
            >
              {URGENCY_LABEL[action.urgency].label}
            </span>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider",
                IMPACT_LABEL[action.estimatedImpact].cls,
              )}
            >
              {IMPACT_LABEL[action.estimatedImpact].label}
            </span>
            {dealLabel && (
              <span className="text-[11px] text-muted-foreground">· {dealLabel}</span>
            )}
          </div>
          <div className={cn("mt-2 font-semibold leading-snug", action.completed && "line-through")}>
            {action.action}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{action.reasoning}</p>

          {action.draftContent && (
            <button
              onClick={() => setOpen((o) => !o)}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-300 hover:text-blue-200"
            >
              {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {open ? "Hide" : "Show"} draft content
            </button>
          )}

          {open && action.draftContent && (
            <div className="mt-2 rounded-md border border-border/60 bg-background/40 p-3">
              {editing ? (
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={8}
                  className="font-mono text-xs"
                />
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
                  {action.draftContent}
                </pre>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(action.draftContent ?? "");
                    toast.success("Draft copied to clipboard");
                  }}
                >
                  <Copy className="mr-1 h-3 w-3" /> Copy
                </Button>
                {onUpdateDraft && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (editing) {
                        onUpdateDraft(draft);
                        toast.success("Draft saved");
                      }
                      setEditing((e) => !e);
                    }}
                  >
                    {editing ? "Save" : "Edit"}
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              variant={action.completed ? "outline" : "default"}
              onClick={onToggle}
            >
              <Check className="mr-1 h-3 w-3" />
              {action.completed ? "Mark Open" : "Mark Complete"}
            </Button>
            {action.completed && action.completedAt && (
              <span className="font-mono text-[11px] text-muted-foreground">
                ✓ {new Date(action.completedAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
