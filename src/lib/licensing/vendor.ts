/**
 * Vendor console flag.
 *
 * The licence *generator* (issue / renew / revoke keys) is a Lavisho-internal
 * tool and must not ship enabled on a customer's own deployment. Customer
 * instances still keep licence *activation* (Settings → License).
 *
 * Enable only on the vendor instance:
 *   VITE_VENDOR_CONSOLE=true   (client: shows the nav item + pages)
 *   VENDOR_CONSOLE=true        (server: allows the vendor server functions)
 *
 * Anything other than "true" — including the variable being absent — disables it.
 */
export const VENDOR_CONSOLE_ENABLED =
  String(import.meta.env.VITE_VENDOR_CONSOLE ?? "").toLowerCase() === "true";

/**
 * Only these mailboxes may generate licence keys, even on the vendor instance
 * and even for other super admins. Override with a comma-separated list in
 * VITE_VENDOR_ADMIN_EMAILS (client) / VENDOR_ADMIN_EMAILS (server).
 */
export const DEFAULT_VENDOR_ADMIN_EMAILS = ["fazlur@smartdataltd.com"];

export function parseVendorAdminEmails(raw: string | undefined | null): string[] {
  const list = String(raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : DEFAULT_VENDOR_ADMIN_EMAILS;
}

export const VENDOR_ADMIN_EMAILS = parseVendorAdminEmails(
  import.meta.env.VITE_VENDOR_ADMIN_EMAILS as string | undefined,
);

export function isVendorAdminEmail(email: string | null | undefined): boolean {
  return !!email && VENDOR_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
