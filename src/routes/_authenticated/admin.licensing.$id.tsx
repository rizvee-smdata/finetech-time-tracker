import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Copy, KeyRound, Mail } from "lucide-react";
import {
  getLicenseDetail,
  updateLicenseStatus,
  changeLicenseTerms,
  renewLicense,
  issueReplacementKey,
  resendLicenseEmail,
} from "@/lib/licensing/licenses.functions";
import { EDITION_LABEL } from "@/lib/licensing/useLicense";
import { VENDOR_CONSOLE_ENABLED, VendorConsoleDisabled } from "@/components/licensing/VendorConsoleDisabled";
import { isVendorAdminEmail } from "@/lib/licensing/vendor";

export const Route = createFileRoute("/_authenticated/admin/licensing/$id")({
  head: () => ({
    meta: [
      { title: "License detail — Lavisho TT" },
      { name: "description", content: "Full license terms, seat usage and audit timeline for a Lavisho customer." },
      { property: "og:title", content: "License detail — Lavisho TT" },
      { property: "og:description", content: "License terms, seat usage and audit timeline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LicenseDetailPage,
});

function LicenseDetailPage() {
  const { id } = useParams({ from: "/_authenticated/admin/licensing/$id" });
  const { isSuperAdmin, user } = useAuth();
  const vendorAllowed = VENDOR_CONSOLE_ENABLED && isVendorAdminEmail(user?.email);
  const detail = useServerFn(getLicenseDetail);
  const setStatus = useServerFn(updateLicenseStatus);
  const changeTerms = useServerFn(changeLicenseTerms);
  const renew = useServerFn(renewLicense);
  const replace = useServerFn(issueReplacementKey);
  const resend = useServerFn(resendLicenseEmail);

  const [months, setMonths] = useState("12");
  const [seats, setSeats] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["license", id],
    queryFn: () => detail({ data: { id } }),
    enabled: vendorAllowed && isSuperAdmin,
  });

  if (!vendorAllowed) return <VendorConsoleDisabled />;
  if (!isSuperAdmin) return <div className="p-6 text-sm text-muted-foreground">Vendor admin access required.</div>;
  if (!q.data) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  const l: any = q.data.license;
  const events: any[] = q.data.events;

  const run = async (fn: () => Promise<any>, msg: string) => {
    try {
      await fn();
      toast.success(msg);
      q.refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Action failed");
    }
  };

  return (
    <div className="space-y-4">
      <Link to="/admin/licensing" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to licensing
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{l.customer_name}</h1>
        <p className="text-sm text-muted-foreground">
          {l.customer_email} · {EDITION_LABEL[l.edition] ?? l.edition} · key {l.key_prefix ?? "—"}…
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border p-4 text-sm">
          <h2 className="mb-3 font-medium">Terms</h2>
          <dl className="grid grid-cols-2 gap-y-2">
            <dt className="text-muted-foreground">Status</dt><dd className="capitalize">{l.status}</dd>
            <dt className="text-muted-foreground">Organization</dt><dd>{l.organization_name ?? "Not activated"}</dd>
            <dt className="text-muted-foreground">Bound domain</dt><dd>{l.bind_domain ? `@${l.bind_domain}` : "Customer email domain"}</dd>
            <dt className="text-muted-foreground">Users</dt><dd>{l.seats_used} / {l.max_users ?? "Unlimited"}</dd>
            <dt className="text-muted-foreground">Subscription</dt><dd>{l.term_months ? `${(l.term_months / 12).toFixed(l.term_months % 12 ? 1 : 0)} year(s)` : "Perpetual"}</dd>
            <dt className="text-muted-foreground">Starts</dt><dd>{l.starts_at}</dd>
            <dt className="text-muted-foreground">Expires</dt><dd>{l.expires_at ?? "Perpetual"}</dd>
            <dt className="text-muted-foreground">Grace days</dt><dd>{l.grace_days}</dd>
          </dl>
          {l.notes && <p className="mt-3 text-muted-foreground">{l.notes}</p>}
        </section>

        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="font-medium">Actions</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => run(() => setStatus({ data: { id, action: "suspend" } }), "License suspended")}>Suspend</Button>
            <Button variant="outline" size="sm" onClick={() => run(() => setStatus({ data: { id, action: "reinstate" } }), "License reinstated")}>Reinstate</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirm("Revoke this license? The customer will be locked out immediately.")) {
                  run(() => setStatus({ data: { id, action: "revoke" } }), "License revoked");
                }
              }}
            >
              Revoke
            </Button>
          </div>

          <div className="grid grid-cols-2 items-end gap-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">Term months</Label>
              <Input value={months} onChange={(e) => setMonths(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => run(() => renew({ data: { id, term_months: Number(months), max_users: seats ? Number(seats) : undefined } }), "License renewed")}>
                Renew
              </Button>
              <Button size="sm" variant="outline" onClick={() => run(() => changeTerms({ data: { id, add_months: Number(months) } }), "Term extended")}>
                Extend
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 items-end gap-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">Seat count</Label>
              <Input value={seats} onChange={(e) => setSeats(e.target.value)} placeholder={String(l.max_users ?? "")} />
            </div>
            <Button size="sm" variant="outline" onClick={() => run(() => changeTerms({ data: { id, max_users: seats ? Number(seats) : null } }), "Seats updated")}>
              Change seats
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => run(() => resend({ data: { id } }), "License details emailed to the customer")}
            >
              <Mail className="mr-2 h-4 w-4" /> Resend license email
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                if (!confirm("Revoke the current key and issue a replacement?")) return;
                try {
                  const res: any = await replace({ data: { id } });
                  setNewKey(res.key);
                  q.refetch();
                } catch (e: any) {
                  toast.error(e.message ?? "Failed");
                }
              }}
            >
              <KeyRound className="mr-2 h-4 w-4" /> Issue replacement key
            </Button>
          </div>


          {newKey && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 font-mono text-xs">
              <span className="flex-1 break-all">{newKey}</span>
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(newKey); toast.success("Copied"); }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 font-medium">Timeline</h2>
        <ul className="space-y-2 text-sm">
          {events.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-4 border-b pb-2 last:border-0">
              <div>
                <div className="font-medium capitalize">{e.event_type.replace(/_/g, " ")}</div>
                {e.details && Object.keys(e.details).length > 0 && (
                  <pre className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{JSON.stringify(e.details)}</pre>
                )}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
            </li>
          ))}
          {!events.length && <li className="text-muted-foreground">No events yet.</li>}
        </ul>
      </section>
    </div>
  );
}
