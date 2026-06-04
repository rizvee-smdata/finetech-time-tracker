export type Rag = "green" | "amber" | "red";

export function ragColor(r: Rag) {
  if (r === "green") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40";
  if (r === "amber") return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40";
  return "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40";
}

export function ragOf(score: number): Rag {
  if (score >= 70) return "green";
  if (score >= 40) return "amber";
  return "red";
}

export function ragOrder(r: Rag) {
  return r === "red" ? 0 : r === "amber" ? 1 : 2;
}

export type ScoreFactor = {
  factor: string;
  label: string;
  value: number;
  deduction: number;
};

export function worstFactor(breakdown: ScoreFactor[] | null | undefined): string {
  if (!breakdown || breakdown.length === 0) return "Healthy";
  const worst = [...breakdown].sort((a, b) => a.deduction - b.deduction)[0];
  return worst.label;
}
