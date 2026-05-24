import { useEffect, useState } from "react";
import { Play, Pause, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTimeStore, computeElapsedSec, formatHMS } from "@/lib/time/storage";

type Props = {
  onStop: () => void;
  onDiscard?: () => void;
  description: string;
  size?: "lg" | "md";
};

export function LiveTimer({ onStop, onDiscard, description, size = "lg" }: Props) {
  const { timer, startTimer, pauseTimer, resumeTimer, discardTimer } = useTimeStore();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = computeElapsedSec(timer, now);
  const { h, m, s } = formatHMS(elapsed);
  const running = !!timer?.isRunning;
  const paused = !!timer?.isPaused;

  const big = size === "lg";

  return (
    <div className="flex flex-col items-center gap-4">
      <div className={big ? "text-6xl md:text-7xl font-mono font-bold tabular-nums text-violet-300 tracking-tight" : "text-3xl font-mono font-bold tabular-nums text-violet-300"}>
        {h}<span className="text-violet-500/60">:</span>{m}<span className="text-violet-500/60">:</span>{s}
      </div>
      {big && (
        <div className="flex items-center gap-6 text-xs text-muted-foreground uppercase tracking-wider">
          <span>hrs</span><span>min</span><span>sec</span>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {!running && !paused && (
          <Button
            size={big ? "lg" : "sm"}
            onClick={() => startTimer(description || "Untitled work")}
            className="bg-violet-600 hover:bg-violet-500 text-white"
          >
            <Play className="mr-2 h-4 w-4" /> Start
          </Button>
        )}
        {running && (
          <Button size={big ? "lg" : "sm"} variant="secondary" onClick={pauseTimer}>
            <Pause className="mr-2 h-4 w-4" /> Pause
          </Button>
        )}
        {paused && (
          <Button size={big ? "lg" : "sm"} onClick={resumeTimer} className="bg-violet-600 hover:bg-violet-500 text-white">
            <Play className="mr-2 h-4 w-4" /> Resume
          </Button>
        )}
        {(running || paused) && (
          <>
            <Button size={big ? "lg" : "sm"} variant="default" onClick={onStop}>
              <Square className="mr-2 h-4 w-4" /> Stop & Save
            </Button>
            <Button size={big ? "lg" : "sm"} variant="ghost" onClick={() => { discardTimer(); onDiscard?.(); }}>
              <Trash2 className="mr-2 h-4 w-4" /> Discard
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
