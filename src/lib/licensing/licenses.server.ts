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

export async function assertVendorAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.is_super_admin) throw new Error("Vendor admin access required");
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

export async function licenseStateFor(companyId: string | null) {
  if (!companyId) return { state: "locked", reason: "no_organization" } as any;
  const { data } = await (supabaseAdmin as any).rpc("get_license_state", { _company: companyId });
  return data as any;
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
