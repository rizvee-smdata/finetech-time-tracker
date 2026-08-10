/**
 * Customer-side licence heartbeat.
 *
 * A self-hosted deployment sets LICENSE_SERVER_URL to the central Lavisho
 * licence server. Every LICENSE_VERIFY_INTERVAL_HOURS the instance asks that
 * server whether its key is still active. If the vendor deactivates
 * (suspends) or revokes the licence, the next check-in flips the local status
 * and the app locks. If the licence server cannot be reached, the instance
 * keeps working for LICENSE_OFFLINE_GRACE_DAYS and then locks, so an offline
 * or firewalled copy cannot run forever.
 *
 * When LICENSE_SERVER_URL is unset (the vendor's own deployment) this is a
 * no-op: that database *is* the source of truth.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function licenseServerUrl(): string | null {
  const raw = String(process.env['LICENSE_SERVER_URL'] ?? "").trim().replace(/\/+$/, "");
  return raw ? raw : null;
}

function intervalMs(): number {
  const h = Number(process.env['LICENSE_VERIFY_INTERVAL_HOURS'] ?? 12);
  return (Number.isFinite(h) && h > 0 ? h : 12) * 3_600_000;
}

export function offlineGraceDays(): number {
  const d = Number(process.env['LICENSE_OFFLINE_GRACE_DAYS'] ?? 7);
  return Number.isFinite(d) && d >= 0 ? d : 7;
}

export type HeartbeatResult = {
  checked: boolean;
  ok?: boolean;
  status?: string;
  offline_days?: number;
  message?: string | null;
};

/**
 * Ask the licence server about this organization's key and persist the answer.
 * Safe to call on every licence-state read: it self-throttles.
 */
export async function heartbeatForCompany(
  companyId: string,
  opts: { force?: boolean } = {},
): Promise<HeartbeatResult> {
  const base = licenseServerUrl();
  if (!base) return { checked: false };

  const { data: lic } = await (supabaseAdmin as any)
    .from("licenses")
    .select("id, key_hash, status, last_verified_at, verify_failed_since, organization_id")
    .eq("organization_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lic?.key_hash) return { checked: false };

  const last = lic.last_verified_at ? new Date(lic.last_verified_at).getTime() : 0;
  if (!opts.force && Date.now() - last < intervalMs()) {
    return { checked: false, status: lic.status };
  }

  let seats_used = 0;
  try {
    const { data } = await (supabaseAdmin as any).rpc("license_seats_used", { _company: companyId });
    seats_used = Number(data ?? 0);
  } catch { /* seats are advisory only */ }

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(`${base}/api/public/license/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key_hash: lic.key_hash,
        organization_id: companyId,
        domain: String(process.env['LICENSE_INSTANCE_DOMAIN'] ?? "") || null,
        seats_used,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`licence server responded ${res.status}`);
    const body = (await res.json()) as any;

    const patch: Record<string, unknown> = {
      last_verified_at: new Date().toISOString(),
      verify_failed_since: null,
      remote_status: String(body.status ?? "unknown"),
    };
    // Mirror the authoritative record so the local state machine agrees.
    if (body.status === "unknown_key") {
      patch['status'] = "revoked";
    } else if (["active", "issued", "suspended", "revoked", "expired"].includes(String(body.status))) {
      patch['status'] = body.status;
    }
    if (body.expires_at !== undefined) patch['expires_at'] = body.expires_at;
    if (body.max_users !== undefined) patch['max_users'] = body.max_users;
    if (body.grace_days !== undefined && body.grace_days !== null) patch['grace_days'] = body.grace_days;

    await (supabaseAdmin as any).from("licenses").update(patch).eq("id", lic.id);
    return { checked: true, ok: !!body.valid, status: String(patch['status'] ?? body.status), message: body.message ?? null };
  } catch (e: any) {
    const since = lic.verify_failed_since ?? new Date().toISOString();
    await (supabaseAdmin as any)
      .from("licenses")
      .update({ verify_failed_since: since, remote_status: "unreachable" })
      .eq("id", lic.id);
    const days = Math.floor((Date.now() - new Date(since).getTime()) / 86_400_000);
    return { checked: true, ok: false, status: "unreachable", offline_days: days, message: e?.message ?? null };
  }
}

/**
 * Extra state applied on top of get_license_state when the licence server has
 * been unreachable beyond the offline grace window.
 */
export async function offlineLockdown(companyId: string): Promise<{ locked: boolean; days: number } | null> {
  if (!licenseServerUrl()) return null;
  const { data: lic } = await (supabaseAdmin as any)
    .from("licenses")
    .select("verify_failed_since")
    .eq("organization_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lic?.verify_failed_since) return null;
  const days = Math.floor((Date.now() - new Date(lic.verify_failed_since).getTime()) / 86_400_000);
  return { locked: days >= offlineGraceDays(), days };
}
