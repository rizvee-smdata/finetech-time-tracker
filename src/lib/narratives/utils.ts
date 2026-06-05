// Format BDT using lakh / crore notation common in Bangladesh.
export function fmtBDT(n: number | null | undefined): string {
  if (n == null || !isFinite(Number(n))) return "৳0";
  const v = Number(n);
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}৳${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${sign}৳${(abs / 1e5).toFixed(2)} L`;
  if (abs >= 1e3) return `${sign}৳${(abs / 1e3).toFixed(1)}k`;
  return `${sign}৳${Math.round(abs).toLocaleString("en-IN")}`;
}

export function fmtPct(n: number | null | undefined, digits = 0): string {
  if (n == null || !isFinite(Number(n))) return "—";
  return `${Number(n).toFixed(digits)}%`;
}

// Returns ISO date strings for previous-week Monday..Sunday in Asia/Dhaka.
export function previousWeekRange(now = new Date()): { start: string; end: string } {
  // Use UTC + offset for Dhaka (+06:00); we only need date-level resolution.
  const dhakaOffsetMs = 6 * 60 * 60 * 1000;
  const dhaka = new Date(now.getTime() + dhakaOffsetMs);
  const day = dhaka.getUTCDay() || 7; // Mon=1..Sun=7
  const thisWeekMonday = new Date(dhaka.getTime() - (day - 1) * 86400000);
  const lastWeekMonday = new Date(thisWeekMonday.getTime() - 7 * 86400000);
  const lastWeekSunday = new Date(lastWeekMonday.getTime() + 6 * 86400000);
  return {
    start: lastWeekMonday.toISOString().slice(0, 10),
    end: lastWeekSunday.toISOString().slice(0, 10),
  };
}

export function readTime(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}
