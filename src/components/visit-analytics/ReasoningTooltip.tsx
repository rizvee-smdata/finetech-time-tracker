import { Info } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

export function ReasoningTooltip({
  reasoning,
  label = "Why?",
}: {
  reasoning: string | string[] | Record<string, unknown> | null | undefined;
  label?: string;
}) {
  if (!reasoning) return null;
  const items: string[] = Array.isArray(reasoning)
    ? reasoning.map(String)
    : typeof reasoning === "string"
      ? [reasoning]
      : Object.entries(reasoning).map(([k, v]) => `${k}: ${String(v)}`);

  return (
    <HoverCard openDelay={120}>
      <HoverCardTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
          <Info className="h-3 w-3" />
          {label}
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 text-xs">
        <p className="mb-1.5 font-semibold">AI reasoning</p>
        <ul className="space-y-1">
          {items.map((it, i) => (
            <li key={i} className="flex gap-1.5"><span className="text-muted-foreground">•</span><span>{it}</span></li>
          ))}
        </ul>
      </HoverCardContent>
    </HoverCard>
  );
}
