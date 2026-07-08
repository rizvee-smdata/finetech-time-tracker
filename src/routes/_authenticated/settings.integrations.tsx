import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Mail, RefreshCw, CheckCircle2, AlertTriangle, Unplug } from "lucide-react";
import { format } from "date-fns";
import {
  startGmailAuth,
  disconnectGmail,
  getMyGmailAccount,
  getCompanyGmailConfig,
  saveCompanyGmailConfig,
  listMyCompanies,
} from "@/lib/gmail/oauth.functions";
import { syncGmailForMe } from "@/lib/gmail/sync.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/settings/integrations")({
  validateSearch: (s: Record<string, unknown>) => ({
    connected: s.connected === "1" || s.connected === 1 ? 1 : undefined,
  }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const search = useSearch({ from: "/_authenticated/settings/integrations" });
  const startFn = useServerFn(startGmailAuth);
  const disconnectFn = useServerFn(disconnectGmail);
  const getAccFn = useServerFn(getMyGmailAccount);
  const syncFn = useServerFn(syncGmailForMe);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [deleteEmails, setDeleteEmails] = useState(false);

  const account = useQuery({
    queryKey: ["gmail-account"],
    queryFn: () => getAccFn(),
    enabled: !!user,
  });

  useEffect(() => {
    if (search.connected === 1) {
      toast.success("Gmail connected");
      qc.invalidateQueries({ queryKey: ["gmail-account"] });
    }
  }, [search.connected, qc]);

  const connect = useMutation({
    mutationFn: () => startFn({ data: { origin: window.location.origin } }),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to start OAuth"),
  });

  const sync = useMutation({
    mutationFn: () => syncFn({ data: {} }),
    onSuccess: (r) => {
      toast.success(`Synced — ${r.newEmails} new emails matched`);
      qc.invalidateQueries({ queryKey: ["gmail-account"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Sync failed"),
  });

  const disconnect = useMutation({
    mutationFn: (opts: { deleteEmails: boolean }) => disconnectFn({ data: opts }),
    onSuccess: () => {
      toast.success("Gmail disconnected");
      setDisconnectOpen(false);
      qc.invalidateQueries({ queryKey: ["gmail-account"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  // Admin: list all connected accounts
  const isAdmin = useIsAdmin(user?.id);
  const adminList = useQuery({
    queryKey: ["gmail-accounts-admin"],
    queryFn: async () => {
      const { data } = await sb
        .from("gmail_accounts")
        .select("user_id,gmail_address,status,last_synced_at,last_error")
        .order("last_synced_at", { ascending: false, nullsFirst: false });
      return data ?? [];
    },
    enabled: !!isAdmin.data,
  });

  const acc = account.data;
  const status = acc?.status ?? "disconnected";

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Connect external services to enrich your leads.
        </p>
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="rounded-md bg-primary/10 p-3">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Gmail (Google Workspace)</h2>
              {status === "connected" && (
                <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Connected
                </Badge>
              )}
              {status === "error" && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" /> Error
                </Badge>
              )}
              {status === "disconnected" && <Badge variant="secondary">Disconnected</Badge>}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Read-only access to your company Gmail. We only pull emails that match your leads' contacts —
              never your whole mailbox. You can disconnect any time.
            </p>
          </div>
        </div>

        {status === "connected" && acc && (
          <div className="rounded-md border p-3 text-sm space-y-1">
            <div><span className="text-muted-foreground">Account:</span> <b>{acc.gmail_address}</b></div>
            <div>
              <span className="text-muted-foreground">Last synced:</span>{" "}
              {acc.last_synced_at ? format(new Date(acc.last_synced_at), "PPp") : "never"}
            </div>
          </div>
        )}
        {status === "error" && acc?.last_error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            {acc.last_error}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {status === "disconnected" && (
            <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
              {connect.isPending ? "Redirecting…" : "Connect Gmail"}
            </Button>
          )}
          {status === "connected" && (
            <>
              <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
                <RefreshCw className={`h-4 w-4 mr-2 ${sync.isPending ? "animate-spin" : ""}`} />
                Sync now
              </Button>
              <Button variant="ghost" onClick={() => setDisconnectOpen(true)}>
                <Unplug className="h-4 w-4 mr-2" /> Disconnect
              </Button>
            </>
          )}
          {status === "error" && (
            <Button onClick={() => connect.mutate()}>Reconnect</Button>
          )}
        </div>
      </Card>

      {isAdmin.data && (
        <Card className="p-6 space-y-3">
          <h2 className="text-lg font-semibold">Team Gmail connections (admin)</h2>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-2">Address</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Last synced</th>
                  <th className="p-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {(adminList.data ?? []).length === 0 && (
                  <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">No connections yet.</td></tr>
                )}
                {(adminList.data ?? []).map((r: any) => (
                  <tr key={r.user_id} className="border-t">
                    <td className="p-2">{r.gmail_address}</td>
                    <td className="p-2"><Badge variant={r.status === "connected" ? "default" : r.status === "error" ? "destructive" : "secondary"}>{r.status}</Badge></td>
                    <td className="p-2">{r.last_synced_at ? format(new Date(r.last_synced_at), "PPp") : "—"}</td>
                    <td className="p-2 text-muted-foreground truncate max-w-xs">{r.last_error ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Gmail?</AlertDialogTitle>
            <AlertDialogDescription>
              Your tokens will be deleted immediately. You can reconnect anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={deleteEmails}
              onCheckedChange={(v) => setDeleteEmails(v === true)}
            />
            Also delete emails synced from my mailbox
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => disconnect.mutate({ deleteEmails })}>
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function useIsAdmin(userId?: string) {
  return useQuery({
    queryKey: ["is-admin", userId],
    queryFn: async () => {
      if (!userId) return false;
      const { data } = await sb.from("user_roles").select("role").eq("user_id", userId);
      return (data ?? []).some((r: any) => r.role === "admin");
    },
    enabled: !!userId,
  });
}
