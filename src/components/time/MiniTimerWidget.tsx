import { useEffect, useState } from "react";
import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTimeStore, computeElapsedSec, formatHMS } from "@/lib/time/storage";
import { toast } from "sonner";

export function MiniTimerWidget() {
  const { timer, startTimer, stopAndSave, updateTimerFields } = useTimeStore();
  const [now, setNow] = useState(Date.now());
  const [desc, setDesc] = useState("");

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = computeElapsedSec(timer, now);
  const { h, m, s } = formatHMS(elapsed);

  return (
    <div className="rounded-lg border border-violet-500/30 bg-card/40 p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Live timer</div>
      <div className="text-3xl font-mono font-bold tabular-nums text-violet-300 text-center mb-3">
        {h}:{m}:{s}
      </div>
      {timer ? (
        <>
          <div className="text-sm mb-2 truncate">{timer.currentDescription || "Untitled"}</div>
          <Button size="sm" className="w-full" onClick={() => {
            const saved = stopAndSave({
              category: timer.category ?? "Admin",
              billable: timer.billable ?? false,
              dealId: timer.dealId,
              tags: timer.tags ?? [],
            });
            if (saved) toast.success("Entry saved");
          }}>
            <Square className="mr-1 h-3 w-3" /> Stop & Save
          </Button>
        </>
      ) : (
        <div className="space-y-2">
          <Input placeholder="What are you working on?" value={desc} onChange={(e) => setDesc(e.target.value)} className="h-8 text-sm" />
          <Button size="sm" className="w-full bg-violet-600 hover:bg-violet-500 text-white" onClick={() => {
            if (!desc.trim()) { toast.error("Add a description"); return; }
            startTimer(desc, { category: "Admin", billable: false });
            updateTimerFields({ currentDescription: desc });
          }}>
            <Play className="mr-1 h-3 w-3" /> Start
          </Button>
        </div>
      )}
    </div>
  );
}
