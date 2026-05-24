export type AttendanceStatus = "present" | "late" | "absent" | "half_day" | "leave";

export type AttendanceRecord = {
  id: string;
  company_id: string;
  user_id: string;
  work_date: string;
  status: AttendanceStatus;
  check_in_at: string | null;
  check_in_lat: number | null;
  check_in_lng: number | null;
  check_in_address: string | null;
  check_in_distance_m: number | null;
  check_in_within_geofence: boolean | null;
  check_out_at: string | null;
  check_out_lat: number | null;
  check_out_lng: number | null;
  check_out_address: string | null;
  check_out_distance_m: number | null;
  check_out_within_geofence: boolean | null;
  total_minutes: number | null;
  notes: string | null;
};

export type AttendanceSettings = {
  company_id: string;
  work_start_time: string; // "HH:MM:SS"
  work_end_time: string;
  late_threshold_minutes: number;
  half_day_after_minutes: number;
  geofence_lat: number | null;
  geofence_lng: number | null;
  geofence_radius_m: number | null;
  geofence_required: boolean;
};

export const STATUS_META: Record<AttendanceStatus, { label: string; cls: string }> = {
  present:  { label: "Present",  cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200" },
  late:     { label: "Late",     cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200" },
  absent:   { label: "Absent",   cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200" },
  half_day: { label: "Half day", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200" },
  leave:    { label: "On leave", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200" },
};

/** Haversine distance in meters between two GPS coordinates. */
export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

/** Determine status from check-in time vs shift start. */
export function statusFromCheckIn(checkInAt: Date, workStartTime: string, lateThresholdMin: number): AttendanceStatus {
  const [h, m] = workStartTime.split(":").map(Number);
  const shiftStart = new Date(checkInAt);
  shiftStart.setHours(h, m, 0, 0);
  const diffMin = (checkInAt.getTime() - shiftStart.getTime()) / 60000;
  if (diffMin > lateThresholdMin) return "late";
  return "present";
}

export type GpsPosition = { lat: number; lng: number; accuracy: number };

export async function getCurrentPosition(): Promise<GpsPosition> {
  if (!("geolocation" in navigator)) {
    throw new Error("GPS is not available in this browser");
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(new Error(err.message || "Could not get location")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

/** Reverse geocode via Google Maps connector; returns null on any failure. */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json?latlng=${lat},${lng}`,
      { headers: { "X-Use-Connection": "google_maps" } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.results?.[0]?.formatted_address ?? null;
  } catch {
    return null;
  }
}
