import { cn } from "@/lib/utils";
import { ragOf } from "@/lib/scorecard/scoring";

interface Props {
  score: number; // 0-100
  size?: number;
  label?: string;
}

export function ScoreGauge({ score, size = 160, label = "Overall Score" }: Props) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const rag = ragOf(clamped);
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (clamped / 100) * circ;

  const color =
    rag === "green" ? "stroke-success" : rag === "amber" ? "stroke-warning" : rag === "red" ? "stroke-destructive" : "stroke-muted-foreground";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={stroke}
            className="fill-none stroke-muted"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            className={cn("fill-none transition-all duration-700", color)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-4xl font-bold tabular-nums">{clamped}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">/ 100</div>
        </div>
      </div>
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
    </div>
  );
}
