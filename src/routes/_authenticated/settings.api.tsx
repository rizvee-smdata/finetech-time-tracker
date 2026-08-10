import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Copy, KeyRound, Webhook, Trash2, ExternalLink } from "lucide-react";
import {
  listApiKeys, createApiKey, setApiKeyActive, deleteApiKey,
  listWebhooks, createWebhook, updateWebhook, deleteWebhook, listDeliveries,
} from "@/lib/api/developer.functions";

const EVENTS = ["lead.created", "lead.updated", "lead.stage_changed"];

export const Route = createFileRoute("/_authenticated/settings/api")({
  head: () => ({
    meta: [
      { title: "API & Webhooks — Developer Settings" },
      { name: "description", content: "Create API keys, register webhook endpoints and monitor deliveries for your workspace." },
      { property: "og:title", content: "API & Webhooks — Developer Settings" },
      { property: "og:description", content: "Programmatic access to your CRM data with scoped API keys and signed webhooks." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApiSettingsPage,
});

function ApiSettingsPage() {
  const { companyId } = useAuth();
  const qc = useQueryClient();

  const fnListKeys = useServerFn(listApiKeys);
  const fnCreateKey = useServerFn(createApiKey);
  const fnToggleKey = useServerFn(setApiKeyActive);
  const fnDeleteKey = useServerFn(deleteApiKey);
  const fnListHooks = useServerFn(listWebhooks);
  const fnCreateHook = useServerFn(createWebhook);
  const fnUpdateHook = useServerFn(updateWebhook);
  const fnDeleteHook = useServerFn(deleteWebhook);
  const fnDeliveries = useServerFn(listDeliveries);

  const keys = useQuery({
    queryKey: ["api-keys", companyId],
    queryFn: () => fnListKeys({ data: { companyId: companyId! } }),
    enabled: !!companyId,
  });
  const hooks = useQuery({
    queryKey: ["webhooks", companyId],
    queryFn: () => fnListHooks({ data: { companyId: companyId! } }),
    enabled: !!companyId,
  });
  const deliveries = useQuery({
    queryKey: ["webhook-deliveries", companyId],
    queryFn: () => fnDeliveries({ data: { companyId: companyId! } }),
    enabled: !!companyId,
  });

  const [keyName, setKeyName] = useState("");
  const [canWrite, setCanWrite] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const createKeyMut = useMutation({
    mutationFn: () =>
      fnCreateKey({
        data: {
          companyId: companyId!,
          name: keyName.trim(),
          scopes: canWrite ? ["read", "write"] : ["read"],
        },
      }),
    onSuccess: (res: { key: string }) => {
      setNewKey(res.key);
      setKeyName("");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [hookUrl, setHookUrl] = useState("");
  const [hookEvents, setHookEvents] = useState<string[]>(["lead.created"]);

  const createHookMut = useMutation({
    mutationFn: () => fnCreateHook({ data: { companyId: companyId!, url: hookUrl.trim(), events: hookEvents } }),
    onSuccess: () => {
      toast.success("Webhook registered");
      setHookUrl("");
      qc.invalidateQueries({ queryKey: ["webhooks"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const copy = (v: string) => {
    void navigator.clipboard.writeText(v);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">API &amp; Webhooks</h1>
        <p className="text-muted-foreground text-sm">
          Programmatic access to your workspace data. Base URL <code className="text-xs">/api/public/v1</code> ·{" "}
          <a href="/api/public/v1/openapi.json" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
            OpenAPI spec <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </header>

      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          <h2 className="font-medium">API keys</h2>
        </div>

        {newKey && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
            <p className="text-sm font-medium">Copy this key now — it is shown only once.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate text-xs">{newKey}</code>
              <Button size="sm" variant="secondary" onClick={() => copy(newKey)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setNewKey(null)}>Done</Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="keyName">Key name</Label>
            <Input id="keyName" value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="Zapier integration" className="w-64" />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch id="write" checked={canWrite} onCheckedChange={setCanWrite} />
            <Label htmlFor="write">Allow writes</Label>
          </div>
          <Button disabled={!keyName.trim() || createKeyMut.isPending} onClick={() => createKeyMut.mutate()}>
            Create key
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Prefix</TableHead>
              <TableHead>Scopes</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Active</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(keys.data ?? []).map((k: any) => (
              <TableRow key={k.id}>
                <TableCell className="font-medium">{k.name}</TableCell>
                <TableCell><code className="text-xs">ltt_{k.key_prefix}…</code></TableCell>
                <TableCell className="space-x-1">
                  {k.scopes.map((s: string) => <Badge key={s} variant="secondary">{s}</Badge>)}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "never"}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={k.is_active}
                    onCheckedChange={(v) =>
                      fnToggleKey({ data: { id: k.id, active: v } }).then(() => qc.invalidateQueries({ queryKey: ["api-keys"] }))
                    }
                  />
                </TableCell>
                <TableCell>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => fnDeleteKey({ data: { id: k.id } }).then(() => qc.invalidateQueries({ queryKey: ["api-keys"] }))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!keys.isLoading && (keys.data ?? []).length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-muted-foreground text-sm">No API keys yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Webhook className="h-4 w-4" />
          <h2 className="font-medium">Webhook endpoints</h2>
        </div>
        <p className="text-muted-foreground text-xs">
          Each request is signed with <code>x-webhook-signature</code> = HMAC-SHA256 of <code>timestamp.body</code> using the endpoint secret.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="hookUrl">Endpoint URL</Label>
            <Input id="hookUrl" value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} placeholder="https://example.com/hooks/crm" className="w-80" />
          </div>
          <div className="flex flex-wrap gap-3 pb-2">
            {EVENTS.map((ev) => (
              <label key={ev} className="flex items-center gap-1.5 text-sm">
                <Checkbox
                  checked={hookEvents.includes(ev)}
                  onCheckedChange={(v) =>
                    setHookEvents((prev) => (v ? [...prev, ev] : prev.filter((e) => e !== ev)))
                  }
                />
                {ev}
              </label>
            ))}
          </div>
          <Button disabled={!hookUrl.trim() || hookEvents.length === 0 || createHookMut.isPending} onClick={() => createHookMut.mutate()}>
            Add endpoint
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>URL</TableHead>
              <TableHead>Events</TableHead>
              <TableHead>Secret</TableHead>
              <TableHead>Active</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(hooks.data ?? []).map((h: any) => (
              <TableRow key={h.id}>
                <TableCell className="max-w-[260px] truncate">{h.url}</TableCell>
                <TableCell className="space-x-1">
                  {h.events.map((e: string) => <Badge key={e} variant="outline">{e}</Badge>)}
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => copy(h.secret)}>
                    <Copy className="mr-1 h-3.5 w-3.5" /> Copy
                  </Button>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={h.is_active}
                    onCheckedChange={(v) =>
                      fnUpdateHook({ data: { id: h.id, is_active: v } }).then(() => qc.invalidateQueries({ queryKey: ["webhooks"] }))
                    }
                  />
                </TableCell>
                <TableCell>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => fnDeleteHook({ data: { id: h.id } }).then(() => qc.invalidateQueries({ queryKey: ["webhooks"] }))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!hooks.isLoading && (hooks.data ?? []).length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-muted-foreground text-sm">No endpoints registered.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-medium">Recent deliveries</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Attempts</TableHead>
              <TableHead>Response</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(deliveries.data ?? []).map((d: any) => (
              <TableRow key={d.id}>
                <TableCell>{d.event}</TableCell>
                <TableCell>
                  <Badge variant={d.status === "delivered" ? "secondary" : d.status === "failed" ? "destructive" : "outline"}>
                    {d.status}
                  </Badge>
                </TableCell>
                <TableCell>{d.attempts}</TableCell>
                <TableCell>{d.response_code ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{new Date(d.created_at).toLocaleString()}</TableCell>
              </TableRow>
            ))}
            {!deliveries.isLoading && (deliveries.data ?? []).length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-muted-foreground text-sm">No deliveries yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
