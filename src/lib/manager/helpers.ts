import { formatDistanceToNow } from "date-fns";

export function formatBDT(value: number | null | undefined) {
  if (value == null) return "—";
  const v = Number(value);
  if (!isFinite(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 10000000)
    return `${sign}৳${(abs / 10000000).toFixed(abs >= 100000000 ? 0 : 2).replace(/\.?0+$/, "")}Cr`;
  if (abs >= 100000)
    return `${sign}৳${(abs / 100000).toFixed(abs >= 1000000 ? 0 : 2).replace(/\.?0+$/, "")}L`;
  return `${sign}৳${Math.round(abs).toLocaleString("en-IN")}`;
}

export function slaInfo(submittedAt: string | null | undefined) {
  if (!submittedAt) return { label: "—", breached: false, hours: 0 };
  const submitted = new Date(submittedAt).getTime();
  const ms = Date.now() - submitted;
  const hours = ms / 3_600_000;
  return {
    label: formatDistanceToNow(submitted, { addSuffix: true }),
    breached: hours > 24,
    hours,
  };
}

export function initialsOf(name: string | null | undefined) {
  if (!name) return "??";
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
