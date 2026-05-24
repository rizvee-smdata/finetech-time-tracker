import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { fetchCompanyMembers } from "@/lib/crm/queries";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Copy, Trash2, RefreshCcw, Globe, Key } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const sb = supabase as any;
const CAPTURE_URL = "https://project--4b057a3a-1c4d-4b4b-afb2-b4ad1f521b36.lovable.app/api/public/hooks/crm-lead-capture";

export const Route = createFileRoute("/_authenticated/crm/capture")({
  component: CapturePage,
});

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return "lvc_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

type CaptureKey = {
  id: string;
  label: string;
  token: string;
  default_assignee: string | null;
  default_source: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
};

function CapturePage() {
  const { companyId, user, ready, isStaff } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [source, setSource] = useState("inbound");
  const [revealed, setRevealed] = useState<string | null>(null);

  const keys = useQuery({
    queryKey: ["crm-capture-keys", companyId],
    enabled: ready && !!companyId && isStaff,
    queryFn: async () => {
      const { data, error } = await sb
        .from("crm_capture_keys")
        .select("id, label, token, default_assignee, default_source, is_active, last_used_at, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CaptureKey[];
    },
  });

  const members = useQuery({
    queryKey: ["crm-members", companyId],
    enabled: ready && !!companyId,
    queryFn: () => fetchCompanyMembers(companyId!),
  });

  const create = useMutation({
    mutationFn: async () => {
      const token = randomToken();
      const { data, error } = await sb.from("crm_capture_keys").insert({
        company_id: companyId,
        label: label.trim(),
        token,
        default_assignee: assignee || user!.id,
        default_source: source,
        created_by: user!.id,
      }).select("token").single();
      if (error) throw error;
      return data.token as string;
    },
    onSuccess: (token) => {
      toast.success("Capture key created");
      setRevealed(token);
      setOpen(false);
      setLabel(""); setAssignee(""); setSource("inbound");
      qc.invalidateQueries({ queryKey: ["crm-capture-keys"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await sb.from("crm_capture_keys").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-capture-keys"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("crm_capture_keys").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Key revoked");
      qc.invalidateQueries({ queryKey: ["crm-capture-keys"] });
    },
  });

  const copy = (text: string, msg = "Copied") => {
    navigator.clipboard.writeText(text);
    toast.success(msg);
  };

  if (!isStaff) {
    return <Card className="p-6 text-sm text-muted-foreground">Only staff and admins can manage capture keys.</Card>;
  }

  const sampleToken = revealed || (keys.data && keys.data[0]?.token) || "YOUR_CAPTURE_KEY";
  const curlSnippet = `curl -X POST '${CAPTURE_URL}' \\
  -H 'Content-Type: application/json' \\
  -H 'x-capture-key: ${sampleToken}' \\
  -d '{"customer_name":"Jane Doe","email":"jane@example.com","phone":"+15555555555","notes":"Asked about pricing"}'`;

  const htmlSnippet = `<form id="lead-form">
  <input name="customer_name" required placeholder="Name" />
  <input name="email" type="email" placeholder="Email" />
  <input name="phone" placeholder="Phone" />
  <textarea name="notes" placeholder="How can we help?"></textarea>
  <button type="submit">Get in touch</button>
</form>
<script>
document.getElementById('lead-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = Object.fromEntries(fd.entries());
  payload.source_label = 'website';
  await fetch('${CAPTURE_URL}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-capture-key': '${sampleToken}' },
    body: JSON.stringify(payload),
  });
  e.target.reset();
  alert('Thanks! We will get in touch shortly.');
});
</script>`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2"><Globe className="h-5 w-5" /> Lead capture</h2>
          <p className="text-sm text-muted-foreground">Receive leads from your website, landing pages or partner integrations directly into this CRM.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />New capture key</Button>
      </header>

      {revealed && (
        <Card className="p-4 border-primary/40 bg-primary/5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="text-xs font-semibold text-primary uppercase tracking-wide">New key — copy it now</div>
              <code className="block text-xs break-all">{revealed}</code>
              <p className="text-xs text-muted-foreground">This token is shown in full only this once. Treat it like a password.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => copy(revealed!, "Key copied")}><Copy className="h-4 w-4" /></Button>
          </div>
        </Card>
      )}

      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Key className="h-4 w-4" />Active keys</h3>
        {keys.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (keys.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No keys yet. Create one to start receiving leads.</p>
        ) : (
          <div className="divide-y">
            {(keys.data ?? []).map((k) => {
              const assigneeName = members.data?.find((m) => m.id === k.default_assignee)?.full_name ?? "—";
              return (
                <div key={k.id} className="py-3 flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{k.label}</span>
                      {!k.is_active && <Badge variant="secondary">disabled</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Assigns to {assigneeName} · source <code className="text-[10px]">{k.default_source}</code>
                      {k.last_used_at && ` · last used ${format(new Date(k.last_used_at), "MMM d, p")}`}
                    </div>
                    <code className="text-[10px] text-muted-foreground break-all">
                      {k.token.slice(0, 10)}…{k.token.slice(-4)}
                    </code>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={k.is_active} onCheckedChange={(v) => toggle.mutate({ id: k.id, is_active: v })} />
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => { if (confirm(`Revoke "${k.label}"? Any sites using it will stop working.`)) remove.mutate(k.id); }}
                      aria-label="Revoke"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Endpoint</h3>
          <Button size="sm" variant="ghost" onClick={() => copy(CAPTURE_URL, "URL copied")}><Copy className="h-3 w-3 mr-1" />Copy URL</Button>
        </div>
        <code className="block rounded bg-muted px-3 py-2 text-xs break-all">{CAPTURE_URL}</code>

        <div>
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-xs font-semibold text-muted-foreground">cURL example</h4>
            <Button size="sm" variant="ghost" onClick={() => copy(curlSnippet, "Snippet copied")}><Copy className="h-3 w-3 mr-1" />Copy</Button>
          </div>
          <pre className="text-[11px] rounded bg-muted p-3 overflow-x-auto whitespace-pre-wrap">{curlSnippet}</pre>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-xs font-semibold text-muted-foreground">Embed on your website</h4>
            <Button size="sm" variant="ghost" onClick={() => copy(htmlSnippet, "Snippet copied")}><Copy className="h-3 w-3 mr-1" />Copy</Button>
          </div>
          <pre className="text-[11px] rounded bg-muted p-3 overflow-x-auto">{htmlSnippet}</pre>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">Accepted fields</p>
          <p><code>customer_name</code> (required), <code>company_name</code>, <code>contact_person</code>, <code>email</code>, <code>phone</code>, <code>location</code>, <code>notes</code>, <code>expected_value</code>, <code>currency</code>, <code>source_label</code>, <code>metadata</code> (object).</p>
          <p>Send the key in the <code>x-capture-key</code> header (or as a Bearer token). Endpoint supports CORS for browser submission.</p>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New capture key</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Label</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Marketing site contact form" autoFocus />
            </div>
            <div>
              <Label>Default assignee</Label>
              <Select value={assignee || user!.id} onValueChange={setAssignee}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(members.data ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">New leads will be assigned to this user.</p>
            </div>
            <div>
              <Label>Default source</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inbound">Inbound</SelectItem>
                  <SelectItem value="referral">Referral</SelectItem>
                  <SelectItem value="cold_call">Cold call</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={!label.trim() || create.isPending}>
              {create.isPending ? <RefreshCcw className="h-4 w-4 animate-spin mr-2" /> : null}
              Generate key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
