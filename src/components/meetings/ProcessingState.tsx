import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  "Reading your notes…",
  "Extracting action items and insights…",
  "Drafting your follow-up email…",
];

export function ProcessingState() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1800);
    return () => clearInterval(id);
  }, []);

  return (
    <Card className="border-amber-500/40 bg-card/60 backdrop-blur">
      <CardContent className="space-y-4 p-10">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-amber-500/20 text-amber-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
          <div>
            <div className="font-semibold">Analyzing meeting…</div>
            <div className="text-xs text-muted-foreground">This usually takes 5–15 seconds.</div>
          </div>
        </div>
        <div className="space-y-2 pl-1">
          {STEPS.map((label, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <div
                key={label}
                className={cn(
                  "flex items-center gap-3 text-sm transition-opacity",
                  done && "text-emerald-400",
                  active && "text-amber-400",
                  !done && !active && "text-muted-foreground opacity-60",
                )}
              >
                {done ? (
                  <Check className="h-4 w-4" />
                ) : active ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <div className="h-2 w-2 rounded-full bg-current opacity-50" />
                )}
                {label}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
