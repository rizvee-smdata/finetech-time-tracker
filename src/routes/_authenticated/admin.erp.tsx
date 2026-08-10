import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plug, RefreshCw, Trash2, Plus, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ERP_PROVIDERS, type ErpConnection, type ErpProvider, type ErpSyncLogRow } from "@/lib/erp/types";
import {
  listErpConnections,
  saveErpConnection,
  deleteErpConnection,
  testErpConnection,
  syncCustomersToErp,
  listErpSyncLog,
} from "@/lib/erp/erp.functions";

export const Route = createFileRoute("/_authenticated/admin/erp")({
  head: () => ({
    meta: [
      { title: "Accounting & ERP Integrations" },
      { name: "description", content: "Connect Xero, QuickBooks, Zoho Books or Tally and push customers and invoices from your CRM." },
      { property: "og:title", content: "Accounting & ERP Integrations" },
      { property: "og:description", content: "Sync CRM customers and quotes into your accounting system." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ErpPage,
});

const EMPTY = {
  id: undefined as string | undefined,
  provider: "xero" as ErpProvider,
  name: "",
  isActive: true,
  endpoint: "",
  authHeaderName: "Authorization",
  tokenEnv: "",
  tenantId: "",
  accountCode: "",
  defaultCurrency: "",
};

function ErpPage() {
  const { companyId, isAdmin } = useAuth();

  if (!companyId) return <p className="p-6 text-sm text-muted-foreground">Select a company first.</p>;
  if (!isAdmin) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-border bg-card p-6">
          <h1 className="text-lg font-semibold">Admins only</h1>
          <p className="mt-1 text-sm text-muted-foreground">You don't have access to this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Accounting & ERP</h1>
        <p className="text-sm text-muted-foreground">
          Push CRM customers and accepted quotes into your accounting system, and keep an audit trail of every sync.
        </p>
      </div>

      <Tabs defaultValue="connections">
        <TabsList>
          <TabsTrigger value="connections"><Plug className="mr-2 h-4 w-4" />Connections</TabsTrigger>
          <TabsTrigger value="log"><ListChecks className="mr-2 h-4 w-4" />Sync log</TabsTrigger>
        </TabsList>
        <TabsContent value="connections" className="mt-4 space-y-3">
          <ConnectionsTab companyId={companyId} />
        </TabsContent>
        <TabsContent value="log" className="mt-4">
          <SyncLogTab companyId={companyId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ConnectionsTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listErpConnections);
  const save = useServerFn(saveErpConnection);
  const remove = useServerFn(deleteErpConnection);
  const test = useServerFn(testErpConnection);
  const syncCustomers = useServerFn(syncCustomersToErp);

  const [form, setForm] = useState({ ...EMPTY });
  const [busy, setBusy] = useState<string | null>(null);

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["erp-connections", companyId],
    queryFn: () => list({ data: { companyId } }) as Promise<ErpConnection[]>,
  });

  const providerHint = ERP_PROVIDERS.find((p) => p.value === form.provider)?.hint ?? "";
  const isXero = form.provider === "xero";

  async function onSave() {
    if (!form.name.trim()) return toast.error("Give the connection a name.");
    if (!isXero && !form.endpoint.trim()) return toast.error("An endpoint URL is required for this provider.");
    setBusy("save");
    try {
      await save({ data: { ...form, companyId } });
      toast.success(form.id ? "Connection updated" : "Connection created");
      setForm({ ...EMPTY });
      qc.invalidateQueries({ queryKey: ["erp-connections", companyId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(null);
    }
  }

  function edit(c: ErpConnection) {
    setForm({
      id: c.id,
      provider: c.provider,
      name: c.name,
      isActive: c.is_active,
      endpoint: (c.config?.endpoint as string) ?? "",
      authHeaderName: (c.config?.auth_header_name as string) ?? "Authorization",
      tokenEnv: (c.config?.token_env as string) ?? "",
      tenantId: (c.config?.tenant_id as string) ?? "",
      accountCode: (c.config?.account_code as string) ?? "",
      defaultCurrency: c.default_currency ?? "",
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading connections…</p>}
        {!isLoading && connections.length === 0 && (
          <Card className="p-6 text-sm text-muted-foreground">No accounting connection yet. Add one on the right.</Card>
        )}
        {connections.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{c.name}</span>
                  <Badge variant="secondary">{ERP_PROVIDERS.find((p) => p.value === c.provider)?.label ?? c.provider}</Badge>
                  {!c.is_active && <Badge variant="outline">Paused</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.config?.endpoint ? c.config.endpoint : "Via connector gateway"}
                  {c.default_currency ? ` · ${c.default_currency}` : ""}
                </p>
                {c.last_status && (
                  <p className={`mt-1 text-xs ${c.last_status.startsWith("error") ? "text-destructive" : "text-emerald-600"}`}>
                    {c.last_status}
                    {c.last_sync_at ? ` · ${format(parseISO(c.last_sync_at), "dd MMM HH:mm")}` : ""}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={async () => {
                    setBusy(c.id);
                    try {
                      const r = (await test({ data: { id: c.id } })) as { ok: boolean; message: string };
                      r.ok ? toast.success(r.message) : toast.error(r.message);
                      qc.invalidateQueries({ queryKey: ["erp-connections", companyId] });
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Test failed");
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />Test
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={async () => {
                    setBusy(c.id);
                    try {
                      const r = (await syncCustomers({ data: { connectionId: c.id, limit: 25 } })) as {
                        synced: number;
                        failed: number;
                      };
                      toast.success(`${r.synced} customer(s) synced${r.failed ? `, ${r.failed} failed` : ""}`);
                      qc.invalidateQueries({ queryKey: ["erp-sync-log", companyId] });
                      qc.invalidateQueries({ queryKey: ["erp-connections", companyId] });
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Sync failed");
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  Sync customers
                </Button>
                <Button size="sm" variant="ghost" onClick={() => edit(c)}>Edit</Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (!confirm(`Delete connection "${c.name}"?`)) return;
                    await remove({ data: { id: c.id } });
                    qc.invalidateQueries({ queryKey: ["erp-connections", companyId] });
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="h-fit space-y-3 p-4">
        <h2 className="font-semibold">{form.id ? "Edit connection" : "New connection"}</h2>

        <div className="space-y-1">
          <Label>Provider</Label>
          <Select value={form.provider} onValueChange={(v) => setForm((f) => ({ ...f, provider: v as ErpProvider }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ERP_PROVIDERS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{providerHint}</p>
        </div>

        <div className="space-y-1">
          <Label>Name</Label>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Finance — production" />
        </div>

        {!isXero && (
          <>
            <div className="space-y-1">
              <Label>Endpoint URL</Label>
              <Input
                value={form.endpoint}
                onChange={(e) => setForm((f) => ({ ...f, endpoint: e.target.value }))}
                placeholder="https://erp.example.com/api/crm-hook"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Auth header</Label>
                <Input value={form.authHeaderName} onChange={(e) => setForm((f) => ({ ...f, authHeaderName: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Token secret name</Label>
                <Input
                  value={form.tokenEnv}
                  onChange={(e) => setForm((f) => ({ ...f, tokenEnv: e.target.value }))}
                  placeholder="ERP_API_TOKEN"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              The token itself is never stored here — save it as a project secret and reference its name.
            </p>
          </>
        )}

        {isXero && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Organisation ID</Label>
              <Input value={form.tenantId} onChange={(e) => setForm((f) => ({ ...f, tenantId: e.target.value }))} placeholder="auto" />
            </div>
            <div className="space-y-1">
              <Label>Account code</Label>
              <Input value={form.accountCode} onChange={(e) => setForm((f) => ({ ...f, accountCode: e.target.value }))} placeholder="200" />
            </div>
          </div>
        )}

        <div className="space-y-1">
          <Label>Default currency</Label>
          <Input value={form.defaultCurrency} onChange={(e) => setForm((f) => ({ ...f, defaultCurrency: e.target.value }))} placeholder="USD" />
        </div>

        <div className="flex items-center justify-between rounded-md border border-border p-2">
          <span className="text-sm">Active</span>
          <Switch checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
        </div>

        <div className="flex gap-2">
          <Button onClick={onSave} disabled={busy === "save"} className="flex-1">
            <Plus className="mr-2 h-4 w-4" />{form.id ? "Save changes" : "Add connection"}
          </Button>
          {form.id && (
            <Button variant="ghost" onClick={() => setForm({ ...EMPTY })}>Cancel</Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function SyncLogTab({ companyId }: { companyId: string }) {
  const listLog = useServerFn(listErpSyncLog);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["erp-sync-log", companyId],
    queryFn: () => listLog({ data: { companyId } }) as Promise<ErpSyncLogRow[]>,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (rows.length === 0) return <Card className="p-6 text-sm text-muted-foreground">Nothing synced yet.</Card>;

  return (
    <Card className="divide-y divide-border">
      {rows.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant={r.status === "success" ? "secondary" : "destructive"}>{r.status}</Badge>
              <span className="font-medium capitalize">{r.entity_type}</span>
              <span className="text-xs text-muted-foreground">{r.direction}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{r.message}</p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            {r.external_id && <div className="font-mono">{r.external_id}</div>}
            {format(parseISO(r.created_at), "dd MMM yyyy HH:mm")}
          </div>
        </div>
      ))}
    </Card>
  );
}
