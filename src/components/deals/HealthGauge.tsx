import { useEffect, useState } from "react";
import { HEALTH_COLORS, type HealthStatus } from "@/lib/deals/types";

type Props = {
  score: number;
  status: HealthStatus;
  size?: number;
  stroke?: number;
  showLabel?: boolean;
};

export function HealthGauge({ score, status, size = 96, stroke = 8, showLabel = true }: Props) {
  const [displayScore, setDisplayScore] = useState(0);
  const color = HEALTH_COLORS[status].hex;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    const start = displayScore;
    const target = Math.max(0, Math.min(100, score));
    const duration = 700;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayScore(Math.round(start + (target - start) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score]);

  const offset = circumference - (displayScore / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          className="text-border/40"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ filter: `drop-shadow(0 0 6px ${color}55)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-semibold tabular-nums" style={{ color, fontSize: size * 0.28 }}>
          {displayScore}
        </div>
        {showLabel && (
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {HEALTH_COLORS[status].label}
          </div>
        )}
      </div>
    </div>
  );
}
