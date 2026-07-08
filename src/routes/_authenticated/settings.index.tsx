import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useState, useRef, useMemo, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  adminCreateUser,
  adminListUsers,
  adminDeleteUser,
  adminResetPassword,
  importCustomers,
  adminCreateCompany,
  adminUpdateCompany,
  adminDeleteCompany,
  adminListCompanies,
  adminSetUserCompanies,
} from "@/lib/admin.functions";
import { backupConfig, backupData, restoreBackup } from "@/lib/backup.functions";
import {
  listRecycleBin,
  restoreDeleted,
  listAuditLog,
  listCompaniesMaintenance,
  setMaintenanceMode,
  snapshotToStorage,
  listSnapshots,
  getSnapshotUrl,
} from "@/lib/safety.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Upload, UserPlus, Users, Building2, Trash2, Pencil, Calendar, Plus, Sparkles, Download, DatabaseBackup, Settings as SettingsIcon, RotateCcw } from "lucide-react";
import { format, parseISO } from "date-fns";

export const Route = createFileRoute("/_authenticated/settings/")({
  component: SettingsPage,
});

type Role = "admin" | "manager" | "employee";

function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Admin tools — manage Lavisho Group companies, users, holidays, and customer data.
        </p>
      </div>
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="flex-wrap">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="holidays">Holidays</TabsTrigger>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="backup">Backup &amp; Restore</TabsTrigger>
          <TabsTrigger value="recycle">Recycle Bin</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <Link
            to="/settings/integrations"
            className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-sm font-medium ring-offset-background transition-all hover:bg-background/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Integrations
          </Link>
          <Link
            to="/settings/form-builder"
            className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-sm font-medium ring-offset-background transition-all hover:bg-background/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Form Builder
          </Link>
        </TabsList>
        <TabsContent value="general" className="space-y-6">
          <CompaniesCard />
          <CreateUserCard />
          <UsersListCard />
        </TabsContent>
        <TabsContent value="holidays" className="space-y-6">
          <WeekendDaysCard />
          <BackdateDaysCard />
          <HolidaysCard />
        </TabsContent>
        <TabsContent value="import" className="space-y-6">
          <ImportCustomersCard />
        </TabsContent>
        <TabsContent value="backup" className="space-y-6">
          <BackupCard />
          <SnapshotsCard />
          <RestoreCard />
        </TabsContent>
        <TabsContent value="recycle" className="space-y-6">
          <RecycleBinCard />
        </TabsContent>
        <TabsContent value="audit" className="space-y-6">
          <AuditLogCard />
        </TabsContent>
        <TabsContent value="maintenance" className="space-y-6">
          <MaintenanceModeCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Backup & Restore ----------

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function BackupCard() {
  const cfgFn = useServerFn(backupConfig);
  const dataFn = useServerFn(backupData);

  const cfgM = useMutation({
    mutationFn: async () => cfgFn(),
    onSuccess: (res: any) => {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      downloadJson(`lavisho-config-backup-${stamp}.json`, res);
      const errCount = Object.keys(res?.errors ?? {}).length;
      toast.success(`Configuration backup ready${errCount ? ` (${errCount} tables skipped)` : ""}`);
    },
    onError: (e: any) => toast.error(e.message ?? "Backup failed"),
  });

  const dataM = useMutation({
    mutationFn: async () => dataFn(),
    onSuccess: (res: any) => {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      downloadJson(`lavisho-data-backup-${stamp}.json`, res);
      const errCount = Object.keys(res?.errors ?? {}).length;
      toast.success(`Data backup ready${errCount ? ` (${errCount} tables skipped)` : ""}`);
    },
    onError: (e: any) => toast.error(e.message ?? "Backup failed"),
  });

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <DatabaseBackup className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Download backup</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Download a full JSON snapshot. Store it somewhere safe — you can restore from these files
        if anything goes wrong.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-border p-4">
          <div className="mb-1 flex items-center gap-2 font-medium">
            <SettingsIcon className="h-4 w-4" /> Configuration backup
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Companies, users &amp; roles, holidays, products, templates, statuses, settings, WhatsApp config, etc.
          </p>
          <Button onClick={() => cfgM.mutate()} disabled={cfgM.isPending}>
            <Download className="mr-2 h-4 w-4" />
            {cfgM.isPending ? "Preparing…" : "Download configuration"}
          </Button>
        </div>
        <div className="rounded-md border border-border p-4">
          <div className="mb-1 flex items-center gap-2 font-medium">
            <DatabaseBackup className="h-4 w-4" /> Data backup
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Customers, leads, quotes, visits, attendance, expenses, tasks, chat, reports, audit logs.
          </p>
          <Button onClick={() => dataM.mutate()} disabled={dataM.isPending}>
            <Download className="mr-2 h-4 w-4" />
            {dataM.isPending ? "Preparing…" : "Download data"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function RestoreCard() {
  const fn = useServerFn(restoreBackup);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<any | null>(null);
  const [mode, setMode] = useState<"upsert" | "skip-existing">("upsert");

  const m = useMutation({
    mutationFn: async () =>
      fn({ data: { kind: parsed.kind, tables: parsed.tables, mode } }),
    onSuccess: (res: any) => {
      const errs = Object.entries(res.summary ?? {}).filter(([, v]: any) => v.error);
      if (errs.length) toast.warning(`Restored with ${errs.length} table errors — check console`);
      else toast.success("Restore complete");
      // eslint-disable-next-line no-console
      console.log("Restore summary", res.summary);
    },
    onError: (e: any) => toast.error(e.message ?? "Restore failed"),
  });

  async function onFile(f: File) {
    setFile(f);
    setParsed(null);
    try {
      const text = await f.text();
      const json = JSON.parse(text);
      if (!json?.kind || !json?.tables) throw new Error("Not a valid backup file");
      setParsed(json);
    } catch (e: any) {
      toast.error(e.message ?? "Invalid file");
    }
  }

  const tableCount = parsed ? Object.keys(parsed.tables).length : 0;
  const rowCount = parsed
    ? Object.values(parsed.tables).reduce((n: number, rows: any) => n + (Array.isArray(rows) ? rows.length : 0), 0)
    : 0;

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <RotateCcw className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Restore from backup</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Upload a previously downloaded backup file. Existing rows with the same ID will be{" "}
        <strong>overwritten</strong> in upsert mode. Always download a fresh backup before restoring.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        <Button variant="outline" onClick={() => inputRef.current?.click()}>
          <Upload className="mr-2 h-4 w-4" /> Choose backup file
        </Button>
        {file && (
          <span className="text-sm text-muted-foreground">
            {file.name} · {(file.size / 1024).toFixed(1)} KB
          </span>
        )}
      </div>
      {parsed && (
        <div className="mt-4 space-y-3 rounded-md border border-border p-4">
          <div className="text-sm">
            <Badge variant="secondary" className="mr-2">{parsed.kind}</Badge>
            {tableCount} tables · {rowCount} rows · generated {parsed.generated_at ?? "—"}
          </div>
          <div className="flex items-center gap-3">
            <Label className="text-xs">Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as any)}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="upsert">Upsert (overwrite by ID)</SelectItem>
                <SelectItem value="skip-existing">Skip existing IDs</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="destructive"
            disabled={m.isPending}
            onClick={() => {
              if (!confirm(`Restore ${rowCount} rows across ${tableCount} tables? This may overwrite existing records.`)) return;
              m.mutate();
            }}
          >
            {m.isPending ? "Restoring…" : "Restore now"}
          </Button>
        </div>
      )}
    </Card>
  );
}

// ---------- Companies ----------

function CompaniesCard() {
  const list = useServerFn(adminListCompanies);
  const create = useServerFn(adminCreateCompany);
  const update = useServerFn(adminUpdateCompany);
  const del = useServerFn(adminDeleteCompany);
  const qc = useQueryClient();
  const { refreshCompanies } = useAuth();

  const { data } = useQuery({ queryKey: ["admin-companies"], queryFn: () => list() });
  const [form, setForm] = useState({ name: "", slug: "" });
  const [editing, setEditing] = useState<{ id: string; name: string; slug: string } | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-companies"] });
    refreshCompanies();
  };

  const createM = useMutation({
    mutationFn: async () => create({ data: form }),
    onSuccess: () => { toast.success("Company created"); setForm({ name: "", slug: "" }); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateM = useMutation({
    mutationFn: async () => update({ data: editing! }),
    onSuccess: () => { toast.success("Company updated"); setEditing(null); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const delM = useMutation({
    mutationFn: async (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Company removed"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <Building2 className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Lavisho Group companies</h2>
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); createM.mutate(); }}
        className="mb-6 grid gap-3 md:grid-cols-[1fr,1fr,auto]"
      >
        <div className="space-y-1.5">
          <Label>Company name</Label>
          <Input required maxLength={120} value={form.name}
            onChange={(e) => {
              const name = e.target.value;
              setForm({
                name,
                slug: form.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60),
              });
            }} />
        </div>
        <div className="space-y-1.5">
          <Label>Slug</Label>
          <Input required pattern="[a-z0-9-]+" value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })} />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={createM.isPending}>Add company</Button>
        </div>
      </form>

      <div className="divide-y divide-border">
        {(data ?? []).map((c: any) => (
          <div key={c.id} className="flex items-center justify-between gap-3 py-3">
            {editing && editing.id === c.id ? (
              (() => {
                const ed = editing;
                return (
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <Input className="max-w-[200px]" value={ed.name}
                      onChange={(e) => setEditing({ ...ed, name: e.target.value })} />
                    <Input className="max-w-[180px]" value={ed.slug}
                      onChange={(e) => setEditing({ ...ed, slug: e.target.value })} />
                    <Button size="sm" onClick={() => updateM.mutate()}>Save</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                );
              })()
            ) : (
              <>
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.slug} · {c.member_count} member{c.member_count === 1 ? "" : "s"}</div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setEditing({ id: c.id, name: c.name, slug: c.slug })}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost"
                    onClick={() => { if (confirm(`Delete ${c.name}? This cannot be undone.`)) delM.mutate(c.id); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
        {!data?.length && <div className="py-6 text-center text-sm text-muted-foreground">No companies yet. Add the first sister concern above.</div>}
      </div>
    </Card>
  );
}

// ---------- Create User ----------

function CompanyMultiSelect({
  value, onChange, companies,
}: { value: string[]; onChange: (ids: string[]) => void; companies: any[] }) {
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      {companies.length === 0 && <div className="text-xs text-muted-foreground">Create a company first.</div>}
      {companies.map((c) => {
        const checked = value.includes(c.id);
        return (
          <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={checked} onCheckedChange={(v) => {
              if (v) onChange([...value, c.id]);
              else onChange(value.filter((x) => x !== c.id));
            }} />
            <span>{c.name}</span>
          </label>
        );
      })}
    </div>
  );
}

function CreateUserCard() {
  const fn = useServerFn(adminCreateUser);
  const list = useServerFn(adminListCompanies);
  const qc = useQueryClient();
  const { data: companies } = useQuery({ queryKey: ["admin-companies"], queryFn: () => list() });
  const [form, setForm] = useState({
    full_name: "", email: "", password: "", role: "employee" as Role, company_ids: [] as string[],
  });

  const m = useMutation({
    mutationFn: async () => fn({ data: form }),
    onSuccess: () => {
      toast.success("User created");
      setForm({ full_name: "", email: "", password: "", role: "employee", company_ids: [] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to create user"),
  });

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <UserPlus className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Create user</h2>
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); m.mutate(); }}
        className="grid gap-4 md:grid-cols-2"
      >
        <div className="space-y-1.5">
          <Label>Full name</Label>
          <Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Temporary password</Label>
          <Input type="text" minLength={8} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Role</Label>
          <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="employee">Employee</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Assign to companies</Label>
          <CompanyMultiSelect
            companies={companies ?? []}
            value={form.company_ids}
            onChange={(ids) => setForm({ ...form, company_ids: ids })}
          />
        </div>
        <div className="md:col-span-2">
          <Button type="submit" disabled={m.isPending}>{m.isPending ? "Creating…" : "Create user"}</Button>
        </div>
      </form>
    </Card>
  );
}

// ---------- Users list ----------

const USERS_PAGE_SIZE = 10;

function UsersListCard() {
  const fn = useServerFn(adminListUsers);
  const setMembers = useServerFn(adminSetUserCompanies);
  const list = useServerFn(adminListCompanies);
  const delUser = useServerFn(adminDeleteUser);
  const resetPwd = useServerFn(adminResetPassword);
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: users } = useQuery({ queryKey: ["admin-users"], queryFn: () => fn() });
  const { data: companies } = useQuery({ queryKey: ["admin-companies"], queryFn: () => list() });
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [pwdUserId, setPwdUserId] = useState<string | null>(null);
  const [newPwd, setNewPwd] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const m = useMutation({
    mutationFn: async () => setMembers({ data: { user_id: editingUserId!, company_ids: draftIds } }),
    onSuccess: () => {
      toast.success("Companies updated");
      setEditingUserId(null);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: async (id: string) => delUser({ data: { user_id: id } }),
    onSuccess: () => { toast.success("User deleted"); qc.invalidateQueries({ queryKey: ["admin-users"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const pwdM = useMutation({
    mutationFn: async () => resetPwd({ data: { user_id: pwdUserId!, password: newPwd } }),
    onSuccess: () => { toast.success("Password updated"); setPwdUserId(null); setNewPwd(""); },
    onError: (e: any) => toast.error(e.message),
  });

  const filteredUsers = useMemo(() => {
    const all = (users ?? []) as any[];
    const q = search.trim().toLowerCase();
    return all.filter((u) => {
      if (activeTab === "all") {
        // include all
      } else if (activeTab === "unassigned") {
        if ((u.company_ids ?? []).length > 0) return false;
      } else {
        if (!(u.company_ids ?? []).includes(activeTab)) return false;
      }
      if (!q) return true;
      return (
        (u.full_name ?? "").toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [users, activeTab, search]);

  useEffect(() => { setPage(1); }, [activeTab, search]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * USERS_PAGE_SIZE;
  const pagedUsers = filteredUsers.slice(pageStart, pageStart + USERS_PAGE_SIZE);

  const tabList = [
    { id: "all", label: "All", count: (users ?? []).length },
    ...((companies ?? []) as any[]).map((c) => ({
      id: c.id,
      label: c.name,
      count: (users ?? []).filter((u: any) => (u.company_ids ?? []).includes(c.id)).length,
    })),
    { id: "unassigned", label: "Unassigned", count: (users ?? []).filter((u: any) => (u.company_ids ?? []).length === 0).length },
  ];

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">All users</h2>
          <Badge variant="secondary">{filteredUsers.length}</Badge>
        </div>
        <Input
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-3">
        <TabsList className="flex flex-wrap h-auto">
          {tabList.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="gap-2">
              {t.label}
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{t.count}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="divide-y divide-border">
        {pagedUsers.map((u: any) => {
          const userCompanies = (companies ?? []).filter((c: any) => u.company_ids?.includes(c.id));
          const isSelf = u.id === user?.id;
          return (
            <div key={u.id} className="space-y-2 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{u.full_name || u.email}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {(u.roles ?? []).map((r: string) => (
                    <Badge key={r} variant={r === "admin" ? "default" : "secondary"}>{r}</Badge>
                  ))}
                  <Button size="sm" variant="ghost"
                    onClick={() => { setEditingUserId(u.id); setDraftIds(u.company_ids ?? []); }}>
                    Manage companies
                  </Button>
                  <Button size="sm" variant="ghost"
                    onClick={() => { setPwdUserId(u.id); setNewPwd(""); }}>
                    Change password
                  </Button>
                  {!isSelf && (
                    <Button size="icon" variant="ghost"
                      onClick={() => { if (confirm(`Delete ${u.email}? This permanently removes the account.`)) delM.mutate(u.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {userCompanies.map((c: any) => (
                  <Badge key={c.id} variant="outline">{c.name}</Badge>
                ))}
                {userCompanies.length === 0 && (
                  <span className="text-xs text-muted-foreground">Not assigned to any company</span>
                )}
              </div>
              {editingUserId === u.id && (
                <div className="rounded-md border border-border p-3">
                  <CompanyMultiSelect
                    companies={companies ?? []}
                    value={draftIds}
                    onChange={setDraftIds}
                  />
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending}>Save</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingUserId(null)}>Cancel</Button>
                  </div>
                </div>
              )}
              {pwdUserId === u.id && (
                <div className="flex flex-wrap items-end gap-2 rounded-md border border-border p-3">
                  <div className="flex-1 space-y-1.5 min-w-[200px]">
                    <Label>New password (min 8 chars)</Label>
                    <Input type="text" minLength={8} value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
                  </div>
                  <Button size="sm" disabled={pwdM.isPending || newPwd.length < 8} onClick={() => pwdM.mutate()}>Update password</Button>
                  <Button size="sm" variant="outline" onClick={() => { setPwdUserId(null); setNewPwd(""); }}>Cancel</Button>
                </div>
              )}
            </div>
          );
        })}
        {!filteredUsers.length && <div className="py-6 text-center text-sm text-muted-foreground">No users match.</div>}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            Page {currentPage} of {totalPages} · {filteredUsers.length} user{filteredUsers.length === 1 ? "" : "s"}
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</Button>
            {Array.from({ length: totalPages }).slice(0, 7).map((_, i) => {
              const p = i + 1;
              return (
                <Button
                  key={p}
                  size="sm"
                  variant={p === currentPage ? "default" : "outline"}
                  onClick={() => setPage(p)}
                >
                  {p}
                </Button>
              );
            })}
            <Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Next</Button>
          </div>
        </div>
      )}
    </Card>
  );
}


// ---------- Import customers ----------

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim().length);
  if (!lines.length) return [];
  const splitLine = (l: string) => {
    const out: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') {
        if (inQ && l[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === "," && !inQ) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = splitLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).map((l) => {
    const cols = splitLine(l);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cols[i] ?? ""));
    return row;
  });
}

function mapKey(row: Record<string, string>, keys: string[]) {
  for (const k of keys) if (row[k]) return row[k];
  return "";
}

function ImportCustomersCard() {
  const fn = useServerFn(importCustomers);
  const { companyId, company, companies } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<any[] | null>(null);
  const [targetCompanyId, setTargetCompanyId] = useState<string | null>(companyId);

  useMemo(() => { if (!targetCompanyId && companyId) setTargetCompanyId(companyId); }, [companyId, targetCompanyId]);

  const m = useMutation({
    mutationFn: async (rows: any[]) => fn({ data: { rows, company_id: targetCompanyId } }),
    onSuccess: (res: any) => {
      toast.success(`Imported ${res.inserted} customers`);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = "";
    },
    onError: (e: any) => toast.error(e.message ?? "Import failed"),
  });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const raw = parseCsv(text);
    const mapped = raw
      .map((r) => ({
        customer_name: mapKey(r, ["customer_name", "customer", "name", "company"]),
        contact_person: mapKey(r, ["contact_person", "contact", "contact_name", "person"]),
        designation: mapKey(r, ["designation", "title", "role"]),
        email: mapKey(r, ["email", "email_address", "e-mail"]),
        phone: mapKey(r, ["phone", "phone_number", "mobile", "contact_number"]),
      }))
      .filter((r) => r.customer_name);
    if (!mapped.length) {
      toast.error("No valid rows found. Required column: customer_name");
      return;
    }
    setPreview(mapped);
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <Upload className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Import customers</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Upload a CSV with columns: <code className="rounded bg-muted px-1">customer_name</code>,{" "}
        <code className="rounded bg-muted px-1">contact_person</code>,{" "}
        <code className="rounded bg-muted px-1">designation</code>,{" "}
        <code className="rounded bg-muted px-1">email</code>,{" "}
        <code className="rounded bg-muted px-1">phone</code>.
      </p>

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr,auto] md:items-end">
        <div className="space-y-1.5">
          <Label>Import into company</Label>
          <Select value={targetCompanyId ?? undefined} onValueChange={(v) => setTargetCompanyId(v)}>
            <SelectTrigger><SelectValue placeholder={company?.name ?? "Select company"} /></SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input ref={inputRef} type="file" accept=".csv,text/csv" onChange={onFile} className="max-w-sm" />
        <Button
          variant="outline"
          type="button"
          onClick={() => {
            const sample =
              "customer_name,contact_person,designation,email,phone\nAcme Corp,Jane Doe,CEO,jane@acme.com,+1 555 1234\n";
            const blob = new Blob([sample], { type: "text/csv" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "customers-template.csv";
            a.click();
          }}
        >
          Download template
        </Button>
      </div>

      {preview && (
        <div className="mt-5 space-y-3">
          <div className="text-sm text-muted-foreground">Previewing {preview.length} rows.</div>
          <div className="max-h-64 overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Customer</th>
                  <th className="px-3 py-2 text-left">Contact</th>
                  <th className="px-3 py-2 text-left">Designation</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Phone</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 50).map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-1.5">{r.customer_name}</td>
                    <td className="px-3 py-1.5">{r.contact_person}</td>
                    <td className="px-3 py-1.5">{r.designation}</td>
                    <td className="px-3 py-1.5">{r.email}</td>
                    <td className="px-3 py-1.5">{r.phone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => m.mutate(preview)} disabled={m.isPending || !targetCompanyId}>
              {m.isPending ? "Importing…" : `Import ${preview.length} customers`}
            </Button>
            <Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------- Holidays ----------

// Bangladesh public holidays 2026. Lunar (Islamic / Hindu / Buddhist) dates are
// approximate and should be adjusted when the government publishes the official gazette.
const BD_HOLIDAYS_2026: { date: string; name: string }[] = [
  { date: "2026-02-21", name: "International Mother Language Day" },
  { date: "2026-03-17", name: "Sheikh Mujib's Birthday & Children's Day" },
  { date: "2026-03-26", name: "Independence Day" },
  { date: "2026-04-03", name: "Shab e-Barat (approx)" },
  { date: "2026-04-14", name: "Pohela Boishakh (Bengali New Year)" },
  { date: "2026-04-15", name: "Jumatul Bida (approx)" },
  { date: "2026-04-17", name: "Shab e-Qadr (approx)" },
  { date: "2026-04-19", name: "Eid-ul-Fitr (approx)" },
  { date: "2026-04-20", name: "Eid-ul-Fitr Holiday (approx)" },
  { date: "2026-04-21", name: "Eid-ul-Fitr Holiday (approx)" },
  { date: "2026-05-01", name: "May Day" },
  { date: "2026-05-31", name: "Buddha Purnima (approx)" },
  { date: "2026-06-26", name: "Eid-ul-Azha (approx)" },
  { date: "2026-06-27", name: "Eid-ul-Azha Holiday (approx)" },
  { date: "2026-06-28", name: "Eid-ul-Azha Holiday (approx)" },
  { date: "2026-07-27", name: "Ashura (approx)" },
  { date: "2026-08-15", name: "National Mourning Day" },
  { date: "2026-09-05", name: "Janmashtami (approx)" },
  { date: "2026-09-25", name: "Eid-e-Miladunnabi (approx)" },
  { date: "2026-10-20", name: "Durga Puja — Vijaya Dashami (approx)" },
  { date: "2026-12-16", name: "Victory Day" },
  { date: "2026-12-25", name: "Christmas Day" },
];

function HolidaysCard() {
  const { companyId, company } = useAuth();
  const qc = useQueryClient();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");

  const list = useQuery({
    queryKey: ["company-holidays", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_holidays")
        .select("id, holiday_date, name")
        .eq("company_id", companyId!)
        .order("holiday_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("No company selected");
      if (!date || !name.trim()) throw new Error("Date and name required");
      const { error } = await supabase.from("company_holidays").insert({
        company_id: companyId, holiday_date: date, name: name.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Holiday added");
      setDate(""); setName("");
      qc.invalidateQueries({ queryKey: ["company-holidays"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("company_holidays").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["company-holidays"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const preload = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("No company selected");
      const existing = new Set((list.data ?? []).map((h: any) => h.holiday_date));
      const rows = BD_HOLIDAYS_2026
        .filter((h) => !existing.has(h.date))
        .map((h) => ({ company_id: companyId, holiday_date: h.date, name: h.name }));
      if (!rows.length) return 0;
      const { error } = await supabase.from("company_holidays").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (count) => {
      if (count === 0) toast.info("All Bangladesh 2026 holidays are already added");
      else toast.success(`Added ${count} Bangladesh 2026 holidays`);
      qc.invalidateQueries({ queryKey: ["company-holidays"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Company holidays</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          {company?.name ? `${company.name} — ` : ""}Visit-entry rules skip Fridays and the dates listed here.
        </p>

        <div className="mb-5 grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input placeholder="e.g. National Day" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button onClick={() => add.mutate()} disabled={add.isPending}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-md border border-dashed border-border bg-muted/30 p-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <div className="flex-1 text-sm">
            <div className="font-medium">Bangladesh national holidays 2026</div>
            <div className="text-xs text-muted-foreground">
              Adds {BD_HOLIDAYS_2026.length} dates. Lunar holidays are approximate — adjust after official gazette.
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => preload.mutate()} disabled={preload.isPending || !companyId}>
            {preload.isPending ? "Adding…" : "Preload 2026"}
          </Button>
        </div>

        {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!list.isLoading && (list.data?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">No holidays defined yet.</p>
        )}
        <ul className="divide-y divide-border">
          {(list.data ?? []).map((h: any) => (
            <li key={h.id} className="flex items-center justify-between py-2">
              <div>
                <div className="font-medium">{h.name}</div>
                <div className="text-xs text-muted-foreground">
                  {format(parseISO(h.holiday_date), "EEEE, dd MMM yyyy")}
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => del.mutate(h.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

const DOW_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function WeekendDaysCard() {
  const { companyId, company } = useAuth();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["company-weekend", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("weekend_days")
        .eq("id", companyId!)
        .single();
      if (error) throw error;
      return (data?.weekend_days ?? [5]) as number[];
    },
  });

  const [selected, setSelected] = useState<number[]>([]);
  useEffect(() => {
    if (q.data) setSelected(q.data);
  }, [q.data]);

  const toggle = (d: number) => {
    setSelected((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("No company selected");
      const { error } = await supabase
        .from("companies")
        .update({ weekend_days: selected })
        .eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Weekend days updated");
      qc.invalidateQueries({ queryKey: ["company-weekend"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="p-6">
      <div className="mb-2 flex items-center gap-2">
        <Calendar className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Weekly holidays</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        {company?.name ? `${company.name} — ` : ""}Pick the days of the week that count as weekend. Visit rules and working-day calculations will skip these.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {DOW_LABELS.map((label, i) => {
          const active = selected.includes(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => toggle(i)}
              className={`rounded-md border px-3 py-1.5 text-sm transition ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <Button onClick={() => save.mutate()} disabled={save.isPending || q.isLoading}>
        {save.isPending ? "Saving…" : "Save weekend days"}
      </Button>
    </Card>
  );
}

function BackdateDaysCard() {
  const { companyId, company } = useAuth();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["company-backdate-days", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("companies")
        .select("visit_backdate_days")
        .eq("id", companyId!)
        .single();
      if (error) throw error;
      return (data?.visit_backdate_days ?? 2) as number;
    },
  });

  const [value, setValue] = useState<number>(2);
  useEffect(() => {
    if (typeof q.data === "number") setValue(q.data);
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("No company selected");
      if (!Number.isInteger(value) || value < 0 || value > 30) {
        throw new Error("Enter a whole number between 0 and 30");
      }
      const { error } = await (supabase as any)
        .from("companies")
        .update({ visit_backdate_days: value })
        .eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Backdate window updated");
      qc.invalidateQueries({ queryKey: ["company-backdate-days"] });
      qc.invalidateQueries({ queryKey: ["company-visit-rules"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="p-6">
      <div className="mb-2 flex items-center gap-2">
        <Calendar className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Visit backdating window</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        {company?.name ? `${company.name} — ` : ""}How many working days back a rep may log a visit. Weekends and holidays are not counted. Set to <strong>0</strong> to only allow today.
      </p>
      <div className="mb-4 flex items-end gap-3">
        <div className="space-y-1.5">
          <Label>Working days</Label>
          <Input
            type="number"
            min={0}
            max={30}
            className="w-32"
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
          />
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending || q.isLoading}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Card>
  );
}

// ---------- Recycle Bin ----------

function RecycleBinCard() {
  const list = useServerFn(listRecycleBin);
  const restore = useServerFn(restoreDeleted);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("all");

  const q = useQuery({
    queryKey: ["recycle-bin", filter],
    queryFn: () => list({ data: filter === "all" ? {} : { entity_type: filter } }),
  });

  const m = useMutation({
    mutationFn: async (row: { entity_type: string; entity_id: string }) =>
      restore({ data: row }),
    onSuccess: () => {
      toast.success("Restored");
      qc.invalidateQueries({ queryKey: ["recycle-bin"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Restore failed"),
  });

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trash2 className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Recycle Bin</h2>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="customer">Customers</SelectItem>
            <SelectItem value="lead">Leads</SelectItem>
            <SelectItem value="quote">Quotes</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Deletions from the last 30 days. Restore re-inserts the row exactly as it was.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="py-2">Type</th><th>Name</th><th>Deleted at</th><th></th>
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).length === 0 && (
              <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">Nothing here.</td></tr>
            )}
            {(q.data ?? []).map((r: any) => (
              <tr key={r.id} className="border-b">
                <td className="py-2"><Badge variant="secondary">{r.entity_type}</Badge></td>
                <td>{r.name}</td>
                <td className="text-muted-foreground">{format(parseISO(r.created_at), "PP p")}</td>
                <td className="text-right">
                  <Button size="sm" variant="outline" disabled={m.isPending}
                    onClick={() => m.mutate({ entity_type: r.entity_type, entity_id: r.entity_id })}>
                    <RotateCcw className="mr-1 h-3 w-3" /> Restore
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------- Audit Log ----------

function AuditLogCard() {
  const list = useServerFn(listAuditLog);
  const [entity, setEntity] = useState("all");
  const [action, setAction] = useState("all");

  const q = useQuery({
    queryKey: ["audit-log", entity, action],
    queryFn: () =>
      list({
        data: {
          ...(entity !== "all" ? { entity_type: entity } : {}),
          ...(action !== "all" ? { action } : {}),
          limit: 200,
        },
      }),
  });

  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SettingsIcon className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Audit Log</h2>
        </div>
        <div className="flex gap-2">
          <Select value={entity} onValueChange={setEntity}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All entities</SelectItem>
              <SelectItem value="customer">Customer</SelectItem>
              <SelectItem value="lead">Lead</SelectItem>
              <SelectItem value="quote">Quote</SelectItem>
            </SelectContent>
          </Select>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              <SelectItem value="create">Create</SelectItem>
              <SelectItem value="update">Update</SelectItem>
              <SelectItem value="delete">Delete</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="max-h-[600px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="py-2">When</th><th>Type</th><th>Action</th><th>Actor</th><th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((r: any) => (
              <tr key={r.id} className="border-b">
                <td className="py-2 text-muted-foreground whitespace-nowrap">{format(parseISO(r.created_at), "PP p")}</td>
                <td><Badge variant="secondary">{r.entity_type}</Badge></td>
                <td>{r.action}</td>
                <td className="font-mono text-xs">{r.actor_id?.slice(0, 8) ?? "—"}</td>
                <td className="text-muted-foreground">{r.summary}</td>
              </tr>
            ))}
            {(q.data ?? []).length === 0 && (
              <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No entries.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------- Maintenance Mode ----------

function MaintenanceModeCard() {
  const list = useServerFn(listCompaniesMaintenance);
  const setMM = useServerFn(setMaintenanceMode);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["maintenance-companies"],
    queryFn: () => list(),
  });

  const m = useMutation({
    mutationFn: async (v: { company_id: string; enabled: boolean }) => setMM({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maintenance-companies"] });
      toast.success("Updated");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <SettingsIcon className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Maintenance mode</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        When enabled, only admins can create, update or delete customers, leads and quotes for that
        company. Use this during a restore or while resolving an incident.
      </p>
      <div className="space-y-2">
        {(q.data ?? []).map((c: any) => (
          <div key={c.id} className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-muted-foreground">
                {c.maintenance_mode ? "Read-only for non-admins" : "Normal operation"}
              </div>
            </div>
            <Button
              variant={c.maintenance_mode ? "destructive" : "outline"}
              size="sm"
              disabled={m.isPending}
              onClick={() => {
                if (!c.maintenance_mode && !confirm(`Enable maintenance mode for ${c.name}? Non-admin writes will be blocked.`)) return;
                m.mutate({ company_id: c.id, enabled: !c.maintenance_mode });
              }}
            >
              {c.maintenance_mode ? "Disable" : "Enable"}
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------- Automatic Snapshots ----------

function SnapshotsCard() {
  const list = useServerFn(listSnapshots);
  const sign = useServerFn(getSnapshotUrl);
  const snap = useServerFn(snapshotToStorage);
  const qc = useQueryClient();

  const q = useQuery({ queryKey: ["snapshots"], queryFn: () => list() });

  const runM = useMutation({
    mutationFn: async () => snap(),
    onSuccess: () => {
      toast.success("Snapshot saved");
      qc.invalidateQueries({ queryKey: ["snapshots"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Snapshot failed"),
  });

  async function download(name: string) {
    const { url } = await sign({ data: { path: name } });
    window.open(url, "_blank");
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <DatabaseBackup className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Automatic snapshots</h2>
        </div>
        <Button size="sm" onClick={() => runM.mutate()} disabled={runM.isPending}>
          {runM.isPending ? "Running…" : "Run snapshot now"}
        </Button>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Daily snapshots are uploaded to private storage and kept for 30 days. You can also trigger one
        manually.
      </p>
      <div className="space-y-2">
        {(q.data ?? []).length === 0 && (
          <div className="text-sm text-muted-foreground">No snapshots yet.</div>
        )}
        {(q.data ?? []).map((f: any) => (
          <div key={f.name} className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <div className="font-mono text-sm">{f.name}</div>
              <div className="text-xs text-muted-foreground">
                {f.metadata?.size ? `${(f.metadata.size / 1024).toFixed(1)} KB · ` : ""}
                {f.created_at ? format(parseISO(f.created_at), "PP p") : ""}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => download(f.name)}>
              <Download className="mr-1 h-3 w-3" /> Download
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

