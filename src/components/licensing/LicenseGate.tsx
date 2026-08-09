import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useLicense } from "@/lib/licensing/useLicense";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

const SALES_EMAIL = "sales@lavishott.cloud";

/**
 * Blocks the app with a lock screen when the organization's license is
 * suspended/revoked. Settings and vendor-admin routes stay reachable so the
 * customer can activate or renew.
 */
export function LicenseGate({ path, children }: { path: string; children: React.ReactNode }) {
  const { info, loading } = useLicense();
  const { isSuperAdmin } = useAuth();

  const allowed =
    path.startsWith("/settings/license") || path.startsWith("/admin/licensing") || isSuperAdmin;

  if (loading || !info || info.state !== "locked" || allowed || info.reason === "no_organization") {
    return <>{children}</>;
  }

  const unlicensed = info.reason === "no_license";

  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="max-w-md space-y-4 rounded-lg border p-8 text-center">
        <Lock className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">
          {unlicensed ? "This deployment needs a license key" : "Your Lavisho license is not active"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {unlicensed
            ? "The 7-day setup window has ended. Activate your license key to continue using the app."
            : "Your data is safe and preserved. Contact us to reinstate or renew your license."}
        </p>
        <div className="flex justify-center gap-2">
          <Button asChild>
            <a href={`mailto:${SALES_EMAIL}?subject=Lavisho%20license%20reinstatement`}>Contact Lavisho</a>
          </Button>
          <Button asChild variant="outline">
            <Link to="/settings/license">License details</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
