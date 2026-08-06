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
