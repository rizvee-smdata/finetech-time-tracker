/**
 * Vendor console flag.
 *
 * The licence *generator* (issue / renew / revoke keys) is a Lavisho-internal
 * tool. It is enabled by default on this codebase and must be switched OFF on
 * a customer's own deployment:
 *   VITE_VENDOR_CONSOLE=false   (client: hides the nav item + pages)
 *   VENDOR_CONSOLE=false        (server: blocks the vendor server functions)
 *
 * Customer instances keep licence *activation* (Settings → License).
 * Even when enabled, only the vendor admin allowlist below may generate keys.
 */
export const VENDOR_CONSOLE_ENABLED =
  String(import.meta.env.VITE_VENDOR_CONSOLE ?? "true").toLowerCase() !== "false";

/**
 * Only these mailboxes may generate licence keys, even on the vendor instance
 * and even for other super admins. Override with a comma-separated list in
 * VITE_VENDOR_ADMIN_EMAILS (client) / VENDOR_ADMIN_EMAILS (server).
 */
import { parseVendorAdminEmails } from "./vendor-emails";

export { DEFAULT_VENDOR_ADMIN_EMAILS, parseVendorAdminEmails } from "./vendor-emails";

export const VENDOR_ADMIN_EMAILS = parseVendorAdminEmails(
  import.meta.env.VITE_VENDOR_ADMIN_EMAILS as string | undefined,
);

export function isVendorAdminEmail(email: string | null | undefined): boolean {
  return !!email && VENDOR_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
