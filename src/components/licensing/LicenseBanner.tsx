import { Link } from "@tanstack/react-router";
import { AlertTriangle, Lock, ShieldAlert } from "lucide-react";
import { useLicense } from "@/lib/licensing/useLicense";

/** Global license status banner shown inside the app shell. */
export function LicenseBanner() {
  const { info } = useLicense();
  if (!info) return null;

  if (info.state === "expiring_soon") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          Your license expires in {info.days_remaining} day{info.days_remaining === 1 ? "" : "s"} ({info.expires_at}).
        </span>
        <Link to="/settings/license" className="ml-auto font-medium underline">
          Renew
        </Link>
      </div>
    );
  }

  if (info.state === "in_grace") {
    const left = (info.grace_days ?? 0) + (info.days_remaining ?? 0);
    return (
      <div className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <span>License expired — renew within {left} day{left === 1 ? "" : "s"} to avoid read-only mode.</span>
        <Link to="/settings/license" className="ml-auto font-medium underline">
          Renew now
        </Link>
      </div>
    );
  }

  if (info.state === "read_only") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-red-400 bg-red-100 px-3 py-2 text-xs font-medium text-red-900 dark:border-red-800 dark:bg-red-950/60 dark:text-red-200">
        <Lock className="h-4 w-4 shrink-0" />
        <span>Read-only mode — your license has expired. Viewing and exports still work.</span>
        <Link to="/settings/license" className="ml-auto underline">
          License details
        </Link>
      </div>
    );
  }

  return null;
}
