import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useRef, useMemo } from "react";
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
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, UserPlus, Users, Building2, Trash2, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  beforeLoad: async () => {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles").select("role").eq("user_id", s.session.user.id);
    if (!(roles ?? []).some((r) => r.role === "admin")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: SettingsPage,
});

type Role = "admin" | "manager" | "employee";

function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Admin tools — manage Lavisho Group companies, users, and import customer data.
        </p>
      </div>
      <CompaniesCard />
      <CreateUserCard />
      <UsersListCard />
      <ImportCustomersCard />
    </div>
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

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">All users</h2>
      </div>
      <div className="divide-y divide-border">
        {(users ?? []).map((u: any) => {
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
        {!users?.length && <div className="py-6 text-center text-sm text-muted-foreground">No users yet.</div>}
      </div>
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
