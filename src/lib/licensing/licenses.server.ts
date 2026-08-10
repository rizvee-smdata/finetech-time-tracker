import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTrialNotice } from "@/lib/trials/emails.server";

// Crockford Base32 without 0/O/1/I to avoid transcription errors
const CHARSET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

export function generateLicenseKey(): string {
  const bytes = new Uint8Array(25);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => CHARSET[b % CHARSET.length]);
  const groups: string[] = [];
  for (let i = 0; i < 5; i++) groups.push(chars.slice(i * 5, i * 5 + 5).join(""));
  return `LVSH-${groups.join("-")}`;
}

export function normalizeKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * The licence generator runs by default; customer deployments switch it off
 * with VENDOR_CONSOLE=false. Access is still limited to the vendor admin
 * allowlist (VENDOR_ADMIN_EMAILS).
 */
export function vendorConsoleEnabled(): boolean {
  return String(process.env['VENDOR_CONSOLE'] ?? "true").toLowerCase() !== "false";
}

export async function assertVendorAdmin(supabase: any, userId: string) {
  if (!vendorConsoleEnabled()) {
    throw new Error("The licensing console is not available on this deployment.");
  }
  const { parseVendorAdminEmails } = await import("@/lib/licensing/vendor-emails");
  const allowed = parseVendorAdminEmails(process.env['VENDOR_ADMIN_EMAILS']);
  const { data } = await supabase
    .from("profiles")
    .select("is_super_admin, email")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.is_super_admin) throw new Error("Vendor admin access required");
  if (!allowed.includes(String(data.email ?? "").trim().toLowerCase())) {
    throw new Error("Only the software vendor may issue licence keys.");
  }
}

export async function assertOrgAdmin(supabase: any, userId: string, companyId: string) {
  const [{ data: roles }, { data: profile }, { data: member }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.from("profiles").select("is_super_admin").eq("id", userId).maybeSingle(),
    supabase.from("company_members").select("company_id").eq("user_id", userId).eq("company_id", companyId).maybeSingle(),
  ]);
  const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
  if (!profile?.is_super_admin) {
    if (!member) throw new Error("You are not a member of this organization");
    if (!isAdmin) throw new Error("Organization admin access required");
  }
}

export function addMonths(dateISO: string, months: number): string {
  const d = new Date(dateISO + "T00:00:00Z");
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function logEvent(
  licenseId: string,
  event_type: string,
  details: Record<string, unknown> = {},
  actor?: string | null,
) {
  await (supabaseAdmin as any)
    .from("license_events")
    .insert({ license_id: licenseId, event_type, details, actor: actor ?? null });
}

const EDITION_LABEL: Record<string, string> = {
  time_tracker: "Time Tracker",
  crm: "CRM",
  suite: "Suite (Time Tracker + CRM)",
};

export async function sendLicenseKeyEmail(args: {
  to: string;
  customerName: string;
  key: string;
  edition: string;
  maxUsers: number | null;
  expiresAt: string | null;
  bindDomain?: string | null;
}) {
  try {
    await sendTrialNotice(supabaseAdmin, {
      to: args.to,
      subject: "Your Lavisho License Key",
      title: "Your Lavisho License",
      greeting: `Hello ${args.customerName},`,
      intro: "Your Lavisho Time Tracker + CRM license is ready.",
      bodyText: [
        `License key: ${args.key}`,
        `Edition: ${EDITION_LABEL[args.edition] ?? args.edition}`,
        `Seats: ${args.maxUsers ?? "Unlimited"}`,
        `Valid until: ${args.expiresAt ?? "Perpetual"}`,
        ...(args.bindDomain ? [`Bound to domain: @${args.bindDomain}`] : []),
        "",
        "To activate: sign in as your organization administrator, go to Settings → License and enter the key above. Keep this key safe — it is shown only once.",
      ].join("\n"),
      label: "license-key",
      idempotencyKey: crypto.randomUUID(),
    });
  } catch (e) {
    // Never surface (or log) the key on failure
    console.error("License email failed to enqueue");
  }
}

export async function sendLicenseNotice(args: {
  to: string;
  subject: string;
  title: string;
  bodyText: string;
}) {
  try {
    await sendTrialNotice(supabaseAdmin, {
      to: args.to,
      subject: args.subject,
      title: args.title,
      bodyText: args.bodyText,
      label: "license-notice",
      idempotencyKey: crypto.randomUUID(),
    });
  } catch {
    console.error("License notice failed to enqueue");
  }
}

export async function seatsUsed(companyId: string): Promise<number> {
  const { data } = await (supabaseAdmin as any).rpc("license_seats_used", { _company: companyId });
  return Number(data ?? 0);
}

export async function licenseStateFor(companyId: string | null, opts: { force?: boolean } = {}) {
  if (!companyId) return { state: "locked", reason: "no_organization" } as any;

  // Self-hosted instances check in with the central licence server first, so a
  // licence deactivated by the vendor stops this copy of the app.
  const remote = await import("./remote.server");
  let heartbeat: any = { checked: false };
  if (remote.licenseServerUrl()) {
    try {
      heartbeat = await remote.heartbeatForCompany(companyId, { force: opts.force });
    } catch { /* fall through to local state */ }
  }

  const { data } = await (supabaseAdmin as any).rpc("get_license_state", { _company: companyId });
  const state = (data ?? {}) as any;

  if (state.license_id) {
    const { data: meta } = await (supabaseAdmin as any)
      .from("licenses")
      .select("last_verified_at, remote_status")
      .eq("id", state.license_id)
      .maybeSingle();
    state.last_verified_at = meta?.last_verified_at ?? null;
    state.remote_status = meta?.remote_status ?? null;
  }

  if (remote.licenseServerUrl()) {
    const offline = await remote.offlineLockdown(companyId);
    state.license_server = true;

    if (offline) {
      state.offline_days = offline.days;
      state.offline_grace_days = remote.offlineGraceDays();
      if (offline.locked && state.state !== "locked") {
        state.state = "locked";
        state.reason = "license_server_unreachable";
      }
    }
    if (heartbeat?.message) state.remote_message = heartbeat.message;
  }
  return state;
}


/** Throws when the organization may not perform write operations. */
export async function assertWritable(companyId: string | null) {
  const s = await licenseStateFor(companyId);
  if (s?.state === "locked" || s?.state === "read_only") {
    throw new Error("Your license is not active. Please renew to continue making changes.");
  }
  return s;
}

/** Throws when adding one more user would exceed the licensed seat count. */
export async function assertSeatAvailable(companyId: string) {
  const s = await licenseStateFor(companyId);
  const max = s?.max_users ?? null;
  if (max == null) return;
  const used = await seatsUsed(companyId);
  if (used + 1 > Number(max)) {
    if (s?.license_id) {
      await logEvent(s.license_id, "seats_changed", {
        rejected: true,
        attempted: used + 1,
        max_users: max,
      });
    }
    throw new Error(`Seat limit reached (${used} of ${max} used). Contact Lavisho to add seats.`);
  }
}

/* ------------------------------------------------------------------ *
 * Activation binding: a key may only be redeemed by the customer it
 * was issued to, and only after N failed tries the key is locked.
 * ------------------------------------------------------------------ */

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com",
  "live.com", "icloud.com", "aol.com", "proton.me", "protonmail.com",
  "gmx.com", "mail.com", "yandex.com", "zoho.com", "qq.com", "163.com",
]);

export const MAX_KEY_FAILURES = 5;

function domainOf(email: string) {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

/** Returns the activating user's verified email, or throws. */
export async function verifiedEmailOf(userId: string): Promise<string> {
  const { data, error } = await (supabaseAdmin as any).auth.admin.getUserById(userId);
  const user = data?.user;
  if (error || !user?.email) throw new Error("Could not verify your account email.");
  const confirmed = user.email_confirmed_at ?? user.confirmed_at;
  if (!confirmed) {
    throw new Error("Please verify your email address before activating a license.");
  }
  return String(user.email).toLowerCase();
}

/**
 * A key issued to customer_email may only be activated by that mailbox, or
 * by another address on the same corporate domain (never a free-mail domain).
 */
export function normalizeDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").replace(/^@/, "");
}

export function emailMatchesLicense(
  actorEmail: string,
  customerEmail: string,
  bindDomain?: string | null,
): boolean {
  const a = actorEmail.trim().toLowerCase();
  const ad = domainOf(a);

  // An explicitly bound domain is authoritative: only mailboxes on that
  // corporate domain (or its subdomains) may redeem the key.
  if (bindDomain) {
    const bd = normalizeDomain(bindDomain);
    if (!bd || FREE_EMAIL_DOMAINS.has(bd)) return false;
    return ad === bd || ad.endsWith(`.${bd}`);
  }

  const c = customerEmail.trim().toLowerCase();
  if (a === c) return true;
  const cd = domainOf(c);
  if (!ad || !cd || ad !== cd) return false;
  return !FREE_EMAIL_DOMAINS.has(cd);
}

export async function recordAttempt(args: {
  companyId: string | null;
  actor: string | null;
  actorEmail: string | null;
  keyHash: string | null;
  keyPrefix: string | null;
  succeeded: boolean;
  reason?: string | null;
}) {
  await (supabaseAdmin as any).from("license_activation_attempts").insert({
    organization_id: args.companyId,
    actor: args.actor,
    actor_email: args.actorEmail,
    key_hash: args.keyHash,
    key_prefix: args.keyPrefix,
    succeeded: args.succeeded,
    reason: args.reason ?? null,
  });
}

/** Global (not per-org) failure count for a specific key in the last 24h. */
export async function keyFailureCount(keyHash: string): Promise<number> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await (supabaseAdmin as any)
    .from("license_activation_attempts")
    .select("id", { count: "exact", head: true })
    .eq("key_hash", keyHash)
    .eq("succeeded", false)
    .gte("created_at", since);
  return Number(count ?? 0);
}

export async function sendActivationConfirmation(args: {
  to: string;
  customerName: string;
  organizationName: string;
  actorEmail: string;
  keyPrefix: string | null;
}) {
  await sendLicenseNotice({
    to: args.to,
    subject: "Your Lavisho license was just activated",
    title: "License activated",
    bodyText: [
      `Hello ${args.customerName},`,
      "",
      `Your Lavisho license (key ${args.keyPrefix ?? "—"}…) was activated for the organization "${args.organizationName}" by ${args.actorEmail} on ${new Date().toUTCString()}.`,
      "",
      "The key is now permanently bound to that organization and cannot be used anywhere else.",
      "If this was not you, contact sales@lavishott.cloud immediately.",
    ].join("\n"),
  });
}
