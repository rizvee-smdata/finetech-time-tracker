import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, ShieldCheck } from "lucide-react";
import { activateLicense } from "@/lib/licensing/licenses.functions";
import { EDITION_LABEL, useLicense } from "@/lib/licensing/useLicense";

export const Route = createFileRoute("/_authenticated/settings/license")({
  head: () => ({
    meta: [
      { title: "License & seats — Lavisho TT" },
      { name: "description", content: "View your Lavisho license edition, seat usage, expiry date and activate or renew your key." },
      { property: "og:title", content: "License & seats — Lavisho TT" },
      { property: "og:description", content: "Edition, seats, expiry and activation for your Lavisho license." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LicenseSettingsPage,
});

const SALES_EMAIL = "sales@lavishott.cloud";

function formatKeyInput(raw: string) {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = clean.startsWith("LVSH") ? clean.slice(4) : clean;
  const groups = body.match(/.{1,5}/g)?.slice(0, 5) ?? [];
  return ["LVSH", ...groups].join("-");
}

function LicenseSettingsPage() {
  const { companyId, isAdmin, isSuperAdmin } = useAuth();
  const { info, refetch } = useLicense();
  const activate = useServerFn(activateLicense);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const recheckFn = useServerFn(recheckLicense);

  async function recheck() {
    if (!companyId) return;
    setChecking(true);
    try {
      const res: any = await recheckFn({ data: { company_id: companyId } });
      toast[res?.state === "locked" ? "error" : "success"](
        res?.remote_message ?? (res?.state === "locked" ? "Licence is not active" : "Licence verified"),
      );
      refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Could not reach the licence server");
    } finally {
      setChecking(false);
    }
  }


  const canManage = isAdmin || isSuperAdmin;
  const seatPct = info?.max_users ? Math.min(100, Math.round(((info.seats_used ?? 0) / info.max_users) * 100)) : 0;
  const showRenew =
    info && (info.state === "expiring_soon" || info.state === "in_grace" || info.state === "read_only" ||
      (info.days_remaining != null && info.days_remaining <= 60));

  async function submit() {
    if (!companyId) return;
    setBusy(true);
    try {
      const res: any = await activate({ data: { license_key: key.trim(), company_id: companyId } });
      toast.success(res.renewed ? "License renewed" : "License activated");
      setKey("");
      refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Activation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ShieldCheck className="h-6 w-6 text-primary" /> License
        </h1>
        <p className="text-sm text-muted-foreground">Your Lavisho edition, seats and term.</p>
      </header>

      {info && info.license_id ? (
        <section className="rounded-lg border p-4 text-sm">
          <dl className="grid grid-cols-2 gap-y-3">
            <dt className="text-muted-foreground">Edition</dt>
            <dd>{EDITION_LABEL[info.edition ?? ""] ?? info.edition}</dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="capitalize">{(info.state ?? "").replace(/_/g, " ")}</dd>
            <dt className="text-muted-foreground">Activated</dt>
            <dd>{info.starts_at ?? "—"}</dd>
            <dt className="text-muted-foreground">Expires</dt>
            <dd>
              {info.expires_at ?? "Perpetual"}
              {info.days_remaining != null && (
                <span className="ml-2 text-muted-foreground">
                  ({info.days_remaining >= 0 ? `${info.days_remaining} days left` : `${-info.days_remaining} days overdue`})
                </span>
              )}
            </dd>
            <dt className="text-muted-foreground">Verified with Lavisho</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <span>
                {(info as any).last_verified_at
                  ? new Date((info as any).last_verified_at).toLocaleString()
                  : "Not yet checked"}
              </span>
              {(info as any).remote_status === "unreachable" && (
                <span className="text-amber-600">
                  licence server unreachable{(info as any).offline_days != null ? ` for ${(info as any).offline_days}d` : ""}
                </span>
              )}
              {canManage && (
                <Button variant="outline" size="sm" onClick={recheck} disabled={checking}>
                  {checking ? "Checking…" : "Check now"}
                </Button>
              )}
            </dd>
          </dl>


          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-muted-foreground">Seats used</span>
              <span className="font-medium">
                {info.seats_used ?? 0} of {info.max_users ?? "Unlimited"}
              </span>
            </div>
            {info.max_users != null && (
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full ${seatPct >= 100 ? "bg-red-500" : seatPct >= 80 ? "bg-amber-500" : "bg-primary"}`}
                  style={{ width: `${seatPct}%` }}
                />
              </div>
            )}
          </div>

          {showRenew && (
            <Button asChild className="mt-4">
              <a href={`mailto:${SALES_EMAIL}?subject=Lavisho%20license%20renewal&body=License%20reference:%20${info.license_id}`}>
                Renew now
              </a>
            </Button>
          )}
        </section>
      ) : (
        <section className="rounded-lg border p-4 text-sm">
          <p className="text-muted-foreground">
            No active license is attached to this organization.
          </p>
        </section>
      )}

      {canManage ? (
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="flex items-center gap-2 font-medium">
            <KeyRound className="h-4 w-4" /> Activate or renew with a key
          </h2>
          <div className="grid gap-1.5">
            <Label>License key</Label>
            <Input
              value={key}
              onChange={(e) => setKey(formatKeyInput(e.target.value))}
              placeholder="LVSH-XXXXX-XXXXX-XXXXX-XXXXX"
              className="font-mono"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={submit} disabled={busy || key.length < 20}>
              {busy ? "Activating…" : "Activate"}
            </Button>
            <a className="text-sm underline text-muted-foreground" href={`mailto:${SALES_EMAIL}?subject=Request%20a%20Lavisho%20license`}>
              Request a license
            </a>
          </div>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">Ask your administrator to activate a license.</p>
      )}
    </div>
  );
}
