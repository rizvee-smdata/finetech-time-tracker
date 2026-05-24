import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Building2, Phone, Globe, MapPin } from "lucide-react";
import { toast } from "sonner";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/crm/accounts")({
  component: AccountsPage,
});

type Account = {
  id: string; name: string; industry: string | null; website: string | null;
  phone: string | null; address: string | null; territory_id: string | null;
  primary_owner: string | null; notes: string | null;
};

function AccountsPage() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [search, setSearch] = useState("");

  const accounts = useQuery({
    queryKey: ["crm-accounts", companyId],
    queryFn: async () => {
      const { data, error } = await sb.from("crm_accounts").select("*").eq("company_id", companyId).order("name");
      if (error) throw error;
      return (data ?? []) as Account[];
    },
    enabled: !!companyId,
  });

  const territories = useQuery({
    queryKey: ["crm-territories", companyId],
    queryFn: async () => {
      const { data } = await sb.from("crm_territories").select("id,name").eq("company_id", companyId).order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: !!companyId,
  });

  const members = useQuery({
    queryKey: ["crm-members", companyId],
    queryFn: async () => {
      const { data: mem } = await sb.from("company_members").select("user_id").eq("company_id", companyId);
      const ids = (mem ?? []).map((m: any) => m.user_id);
      if (!ids.length) return [] as { id: string; full_name: string | null; email: string | null }[];
      const { data: profs } = await sb.from("profiles").select("id, full_name, email").in("id", ids);
      return (profs ?? []) as { id: string; full_name: string | null; email: string | null }[];
    },
    enabled: !!companyId,
  });

  const accountStats = useQuery({
    queryKey: ["crm-account-stats", companyId],
    queryFn: async () => {
      const { data } = await sb.from("crm_leads")
        .select("account_id, expected_value, stage")
        .eq("company_id", companyId);
      const map = new Map<string, { count: number; value: number; won: number; open: number }>();
      for (const l of (data ?? []) as any[]) {
        if (!l.account_id) continue;
        const b = map.get(l.account_id) ?? { count: 0, value: 0, won: 0, open: 0 };
        b.count += 1;
        b.value += Number(l.expected_value || 0);
        if (l.stage === "won") b.won += 1;
        else if (l.stage !== "lost") b.open += 1;
        map.set(l.account_id, b);
      }
      return map;
    },
    enabled: !!companyId,
  });

  async function remove(id: string) {
    if (!confirm("Delete this account? Leads will keep their data but unlink.")) return;
    const { error } = await sb.from("crm_accounts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["crm-accounts", companyId] });
    toast.success("Deleted");
  }

  if (!companyId) return <p className="text-sm text-muted-foreground">Select a company first.</p>;

  const filtered = (accounts.data ?? []).filter((a) =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) || (a.industry ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Accounts</h2>
          <p className="text-sm text-muted-foreground">Companies you sell to. Group multiple leads under one account.</p>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />New account
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No accounts yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => {
            const terr = territories.data?.find((t) => t.id === a.territory_id);
            const owner = members.data?.find((m) => m.id === a.primary_owner);
            const s = accountStats.data?.get(a.id) ?? { count: 0, value: 0, won: 0, open: 0 };
            return (
              <Card key={a.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{a.name}</span>
                    </div>
                    {a.industry && <div className="text-xs text-muted-foreground mt-0.5">{a.industry}</div>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(a); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(a.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {a.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{a.phone}</div>}
                  {a.website && <div className="flex items-center gap-1"><Globe className="h-3 w-3" /><span className="truncate">{a.website}</span></div>}
                  {a.address && <div className="flex items-center gap-1"><MapPin className="h-3 w-3" /><span className="truncate">{a.address}</span></div>}
                  {terr && <div>Territory: <span className="text-foreground">{terr.name}</span></div>}
                  {owner && <div>Owner: <span className="text-foreground">{owner.full_name ?? owner.email}</span></div>}
                </div>
                <div className="flex items-center justify-between pt-1 border-t mt-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium">{s.count}</span>
                    <span className="text-muted-foreground">leads ·</span>
                    <span className="font-medium">${s.value.toLocaleString()}</span>
                  </div>
                  <Link to="/crm/list" className="text-xs text-primary hover:underline">View →</Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AccountDialog open={open} onOpenChange={setOpen} companyId={companyId} editing={editing} territories={territories.data ?? []} members={members.data ?? []} />
    </div>
  );
}

function AccountDialog({
  open, onOpenChange, companyId, editing, territories, members,
}: {
  open: boolean; onOpenChange: (b: boolean) => void; companyId: string;
  editing: Account | null; territories: { id: string; name: string }[];
  members: { id: string; full_name: string | null; email: string | null }[];
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [form, setForm] = useState<Partial<Account>>(editing ?? {});
  const [busy, setBusy] = useState(false);

  // sync on open
  if (open && editing && form.id !== editing.id) setForm(editing);
  if (open && !editing && form.id) setForm({});

  async function submit() {
    if (!form.name?.trim()) return toast.error("Name required");
    setBusy(true);
    const payload: any = {
      company_id: companyId,
      name: form.name.trim(),
      industry: form.industry || null,
      website: form.website || null,
      phone: form.phone || null,
      address: form.address || null,
      territory_id: form.territory_id || null,
      primary_owner: form.primary_owner || null,
      notes: form.notes || null,
    };
    const op = editing
      ? sb.from("crm_accounts").update(payload).eq("id", editing.id)
      : sb.from("crm_accounts").insert({ ...payload, created_by: user?.id });
    const { error } = await op;
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Updated" : "Created");
    qc.invalidateQueries({ queryKey: ["crm-accounts", companyId] });
    qc.invalidateQueries({ queryKey: ["crm-account-stats", companyId] });
    onOpenChange(false);
    setForm({});
  }

  function f<K extends keyof Account>(k: K, v: Account[K]) { setForm((p) => ({ ...p, [k]: v })); }

  return (
    <Dialog open={open} onOpenChange={(b) => { onOpenChange(b); if (!b) setForm({}); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} account</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1 sm:col-span-2">
            <Label>Name *</Label>
            <Input value={form.name ?? ""} onChange={(e) => f("name", e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>Industry</Label>
            <Input value={form.industry ?? ""} onChange={(e) => f("industry", e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>Phone</Label>
            <Input value={form.phone ?? ""} onChange={(e) => f("phone", e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>Website</Label>
            <Input value={form.website ?? ""} onChange={(e) => f("website", e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>Territory</Label>
            <Select value={form.territory_id ?? "none"} onValueChange={(v) => f("territory_id", (v === "none" ? null : v) as any)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {territories.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1 sm:col-span-2">
            <Label>Primary owner</Label>
            <Select value={form.primary_owner ?? "none"} onValueChange={(v) => f("primary_owner", (v === "none" ? null : v) as any)}>
              <SelectTrigger><SelectValue placeholder="— Unassigned —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Unassigned —</SelectItem>
                {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name ?? m.email ?? m.id}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Default rep for new leads under this account.</p>
          </div>
          <div className="grid gap-1 sm:col-span-2">
            <Label>Address</Label>
            <Input value={form.address ?? ""} onChange={(e) => f("address", e.target.value)} />
          </div>
          <div className="grid gap-1 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={3} value={form.notes ?? ""} onChange={(e) => f("notes", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{editing ? "Save" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
