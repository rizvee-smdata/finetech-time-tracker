import { VENDOR_CONSOLE_ENABLED } from "@/lib/licensing/vendor";

/**
 * Shown instead of the licence generator on customer deployments, where the
 * vendor console is switched off (VITE_VENDOR_CONSOLE / VENDOR_CONSOLE).
 */
export function VendorConsoleDisabled() {
  return (
    <div className="grid min-h-[50vh] place-items-center p-6">
      <div className="max-w-md space-y-2 rounded-lg border p-8 text-center">
        <h1 className="text-lg font-semibold">Licensing console unavailable</h1>
        <p className="text-sm text-muted-foreground">
          Licence keys are issued by your software vendor. This deployment can only activate
          and view its own licence under Settings → License.
        </p>
      </div>
    </div>
  );
}

export { VENDOR_CONSOLE_ENABLED };
