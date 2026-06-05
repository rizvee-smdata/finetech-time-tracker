import { DHAKA_AREAS, type StopPriority } from "./types";

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function detectArea(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.toLowerCase();
  for (const a of DHAKA_AREAS) {
    if (t.includes(a.toLowerCase())) return a;
  }
  return null;
}

export function priorityBadgeClass(p: StopPriority): string {
  if (p === "high") return "bg-red-500/15 text-red-600 border-red-500/30";
  if (p === "medium") return "bg-amber-500/15 text-amber-600 border-amber-500/30";
  return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
}

export function priorityMarkerColor(p: StopPriority): string {
  if (p === "high") return "#ef4444";
  if (p === "medium") return "#f59e0b";
  return "#10b981";
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function googleMapsLink(lat: number, lng: number, label?: string): string {
  const q = label ? encodeURIComponent(label) : `${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}&query_place_id=${encodeURIComponent(q)}`;
}

export function workingDayNumber(d: Date, weekendDays: number[] = [5]): number {
  const year = d.getFullYear();
  const month = d.getMonth();
  let count = 0;
  for (let i = 1; i <= d.getDate(); i++) {
    const dt = new Date(year, month, i);
    if (!weekendDays.includes(dt.getDay())) count++;
  }
  return count;
}

// Dhaka traffic: heavy 8-10 AM and 5-7 PM in commercial areas
const HEAVY_TRAFFIC_AREAS = ["Motijheel", "Paltan", "Farmgate"];
export function isHeavyTrafficSlot(area: string | null, dateIso: string): boolean {
  if (!area || !HEAVY_TRAFFIC_AREAS.includes(area)) return false;
  const d = new Date(dateIso);
  const hour = d.getHours();
  return (hour >= 8 && hour < 10) || (hour >= 17 && hour < 19);
}

export function bdt(n: number | null | undefined): string {
  if (n == null) return "—";
  return "৳" + new Intl.NumberFormat("en-IN").format(Math.round(n));
}
