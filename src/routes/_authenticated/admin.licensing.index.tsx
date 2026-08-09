import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, KeyRound, Plus, ShieldCheck } from "lucide-react";
import { issueLicense, listLicenses, licenseReports } from "@/lib/licensing/licenses.functions";
import { EDITION_LABEL } from "@/lib/licensing/useLicense";
import { VENDOR_CONSOLE_ENABLED, VendorConsoleDisabled } from "@/components/licensing/VendorConsoleDisabled";
import { isVendorAdminEmail } from "@/lib/licensing/vendor";

export const Route = createFileRoute("/_authenticated/admin/licensing/")({
  head: () => ({
    meta: [
      { title: "Licensing console — Lavisho TT" },
      { name: "description", content: "Issue, track and renew Lavisho customer licenses, seats and terms." },
      { property: "og:title", content: "Licensing console — Lavisho TT" },
      { property: "og:description", content: "Issue, track and renew Lavisho customer licenses." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LicensingConsole,
});

function daysLeft(expires: string | null) {
  if (!expires) return null;
  return Math.round((new Date(expires + "T00:00:00Z").getTime() - Date.now()) / 86400000);
}

function statusChip(status: string, days: number | null) {
  if (status === "revoked") return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200";
  if (status === "suspended") return "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200";
  if (status === "issued") return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
  if (days != null && days < 0) return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200";
  if (days != null && days <= 30) return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200";
  return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200";
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function LicensingConsole() {
  const { isSuperAdmin } = useAuth();
  const list = useServerFn(listLicenses);
  const reports = useServerFn(licenseReports);
  const issue = useServerFn(issueLicense);

  const [tab, setTab] = useState<"licenses" | "reports">("licenses");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [expiring, setExpiring] = useState("all");
  const [open, setOpen] = useState(false);
  const [issuedKey, setIssuedKey] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["licenses"], queryFn: () => list(), enabled: isSuperAdmin });
  const rq = useQuery({
    queryKey: ["license-reports"],
    queryFn: () => reports(),
    enabled: isSuperAdmin && tab === "reports",
  });

  const rows = useMemo(() => {
    const all = q.data ?? [];
    return all.filter((r: any) => {
      if (status !== "all" && r.status !== status) return false;
      const d = daysLeft(r.expires_at);
      if (expiring !== "all") {
        const n = Number(expiring);
        if (d == null || d < 0 || d > n) return false;
      }
      if (search) {
        const s = search.toLowerCase();
        if (
          !`${r.customer_name} ${r.customer_email} ${r.organization_name ?? ""} ${r.key_prefix ?? ""}`
            .toLowerCase()
            .includes(s)
        )
          return false;
      }
      return true;
    });
  }, [q.data, status, expiring, search]);

  const [form, setForm] = useState({
    customer_name: "",
    customer_email: "",
    bind_domain: "",
    edition: "suite",
    max_users: "25",
    term_years: "1",
    grace_days: "14",
    notes: "",
  });

  async function submit() {
    try {
      const res: any = await issue({
        data: {
          customer_name: form.customer_name,
          customer_email: form.customer_email,
          bind_domain: form.bind_domain || null,
          edition: form.edition as any,
          max_users: form.max_users ? Number(form.max_users) : null,
          term_years: form.term_years ? Number(form.term_years) : null,
          term_months: form.term_years ? Number(form.term_years) * 12 : null,
          grace_days: Number(form.grace_days || 14),
          notes: form.notes || undefined,
          is_renewal_key: false,
        },
      });
      setOpen(false);
      setIssuedKey(res.key);
      q.refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Could not issue license");
    }
  }

  if (!isSuperAdmin) {
    return <div className="p-6 text-sm text-muted-foreground">Vendor admin access required.</div>;
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ShieldCheck className="h-6 w-6 text-primary" /> Licensing console
          </h1>
          <p className="text-sm text-muted-foreground">Issue keys, control seats and manage terms for every customer.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Issue license
        </Button>
      </header>

      <div className="flex gap-1 border-b">
        {(["licenses", "reports"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize ${
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "licenses" && (
        <>
          <div className="flex flex-wrap gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer, org or key prefix…"
              className="w-64"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="issued">Issued</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="revoked">Revoked</option>
              <option value="expired">Expired</option>
            </select>
            <select
              value={expiring}
              onChange={(e) => setExpiring(e.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">Any expiry</option>
              <option value="30">Expiring ≤ 30 days</option>
              <option value="60">Expiring ≤ 60 days</option>
              <option value="90">Expiring ≤ 90 days</option>
            </select>
            <Button
              variant="outline"
              onClick={() => download("licenses.csv", toCsv(rows as any))}
            >
              Export CSV
            </Button>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Customer</th>
                  <th className="px-3 py-2 text-left">Edition</th>
                  <th className="px-3 py-2 text-left">Organization</th>
                  <th className="px-3 py-2 text-left">Seats</th>
                  <th className="px-3 py-2 text-left">Expiry</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => {
                  const d = daysLeft(r.expires_at);
                  return (
                    <tr key={r.id} className="border-t hover:bg-muted/40">
                      <td className="px-3 py-2">
                        <Link to="/admin/licensing/$id" params={{ id: r.id }} className="font-medium hover:underline">
                          {r.customer_name}
                        </Link>
                        <div className="text-xs text-muted-foreground">{r.customer_email}</div>
                      </td>
                      <td className="px-3 py-2">{EDITION_LABEL[r.edition] ?? r.edition}</td>
                      <td className="px-3 py-2">{r.organization_name ?? <span className="text-muted-foreground">Not activated</span>}</td>
                      <td className="px-3 py-2">
                        {r.seats_used} / {r.max_users ?? "∞"}
                      </td>
                      <td className="px-3 py-2">
                        {r.expires_at ?? "Perpetual"}
                        {d != null && (
                          <div className="text-xs text-muted-foreground">
                            {d >= 0 ? `${d} days left` : `${-d} days overdue`}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusChip(r.status, d)}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!rows.length && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No licenses yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "reports" && <ReportsTab data={rq.data as any} />}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Issue license</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Customer name</Label>
              <Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Customer email</Label>
              <Input type="email" value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Bind to company domain</Label>
              <Input
                value={form.bind_domain}
                onChange={(e) => setForm({ ...form, bind_domain: e.target.value })}
                placeholder="acme.com"
              />
              <p className="text-xs text-muted-foreground">
                Only users with an email on this domain can activate the key. Leave blank to bind to the customer email's domain.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Edition</Label>
                <select
                  value={form.edition}
                  onChange={(e) => setForm({ ...form, edition: e.target.value })}
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="suite">Suite</option>
                  <option value="time_tracker">Time Tracker</option>
                  <option value="crm">CRM</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label>Number of users (blank = unlimited)</Label>
                <Input value={form.max_users} onChange={(e) => setForm({ ...form, max_users: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Subscription years</Label>
                <select
                  value={form.term_years}
                  onChange={(e) => setForm({ ...form, term_years: e.target.value })}
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                >
                  {[1, 2, 3, 4, 5, 10].map((y) => (
                    <option key={y} value={String(y)}>{y} year{y > 1 ? "s" : ""}</option>
                  ))}
                  <option value="">Perpetual</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label>Grace days</Label>
                <Input value={form.grace_days} onChange={(e) => setForm({ ...form, grace_days: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={!form.customer_name || !form.customer_email}>
              Generate key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!issuedKey} onOpenChange={() => setIssuedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> License key created
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Copy this key now — it is hashed in storage and will never be shown again. It has also been emailed to the customer.
          </p>
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 font-mono text-sm">
            <span className="flex-1 break-all">{issuedKey}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(issuedKey ?? "");
                toast.success("Key copied");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setIssuedKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReportsTab({ data }: { data?: { licenses: any[]; events: any[] } }) {
  const [eventType, setEventType] = useState("all");
  if (!data) return <div className="p-6 text-sm text-muted-foreground">Loading reports…</div>;
  const now = Date.now();
  const within = (n: number) =>
    data.licenses.filter((l) => {
      if (!l.expires_at) return false;
      const d = Math.round((new Date(l.expires_at + "T00:00:00Z").getTime() - now) / 86400000);
      return d >= 0 && d <= n;
    });
  const pipeline = within(90);
  const upsell = data.licenses.filter((l) => (l.utilization ?? 0) >= 80);
  const portfolio = Object.entries(
    data.licenses.reduce((acc: Record<string, { count: number; seats: number }>, l) => {
      const k = `${l.edition} · ${l.status}`;
      acc[k] = acc[k] ?? { count: 0, seats: 0 };
      acc[k].count++;
      acc[k].seats += l.max_users ?? 0;
      return acc;
    }, {}),
  );
  const events = data.events.filter((e) => eventType === "all" || e.event_type === eventType);

  return (
    <div className="grid gap-4">
      <section className="rounded-lg border p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-medium">Renewal pipeline (next 90 days)</h2>
          <Button variant="outline" size="sm" onClick={() => download("renewal-pipeline.csv", toCsv(pipeline))}>
            Export CSV
          </Button>
        </div>
        <ul className="space-y-1 text-sm">
          {pipeline.map((l) => (
            <li key={l.id} className="flex justify-between border-b py-1 last:border-0">
              <span>
                {l.customer_name} <span className="text-muted-foreground">({l.customer_email})</span>
              </span>
              <span className="text-muted-foreground">{l.expires_at}</span>
            </li>
          ))}
          {!pipeline.length && <li className="text-muted-foreground">Nothing expiring in 90 days.</li>}
        </ul>
      </section>

      <section className="rounded-lg border p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-medium">Seat utilization (upsell candidates ≥ 80%)</h2>
          <Button variant="outline" size="sm" onClick={() => download("seat-utilization.csv", toCsv(data.licenses))}>
            Export CSV
          </Button>
        </div>
        <ul className="space-y-1 text-sm">
          {upsell.map((l) => (
            <li key={l.id} className="flex justify-between border-b py-1 last:border-0">
              <span>{l.customer_name}</span>
              <span className="font-medium text-amber-600">
                {l.seats_used}/{l.max_users} ({l.utilization}%)
              </span>
            </li>
          ))}
          {!upsell.length && <li className="text-muted-foreground">No customers above 80% seat usage.</li>}
        </ul>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-2 font-medium">Portfolio summary</h2>
        <ul className="space-y-1 text-sm">
          {portfolio.map(([k, v]) => (
            <li key={k} className="flex justify-between border-b py-1 last:border-0">
              <span className="capitalize">{k.replace(/_/g, " ")}</span>
              <span className="text-muted-foreground">
                {v.count} licenses · {v.seats} seats
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-medium">Audit trail</h2>
          <div className="flex gap-2">
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="all">All events</option>
              {Array.from(new Set(data.events.map((e) => e.event_type))).map((t) => (
                <option key={t as string} value={t as string}>
                  {t as string}
                </option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={() => download("license-events.csv", toCsv(events))}>
              Export CSV
            </Button>
          </div>
        </div>
        <ul className="max-h-96 space-y-1 overflow-auto text-sm">
          {events.map((e) => (
            <li key={e.id} className="flex justify-between border-b py-1 last:border-0">
              <span className="font-medium">{e.event_type}</span>
              <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
