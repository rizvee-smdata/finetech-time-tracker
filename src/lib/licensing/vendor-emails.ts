/**
 * Vendor admin allowlist — shared by client and server code.
 * Only these mailboxes may generate licence keys.
 */
export const DEFAULT_VENDOR_ADMIN_EMAILS = ["fazlur@smartdataltd.com"];

export function parseVendorAdminEmails(raw: string | undefined | null): string[] {
  const list = String(raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : DEFAULT_VENDOR_ADMIN_EMAILS;
}
