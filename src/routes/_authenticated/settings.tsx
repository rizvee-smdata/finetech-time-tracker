import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { adminCreateUser, adminListUsers, importCustomers } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, UserPlus, Users } from "lucide-react";

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
        <p className="text-sm text-muted-foreground">Admin tools — manage users and import customer data.</p>
      </div>
      <CreateUserCard />
      <UsersListCard />
      <ImportCustomersCard />
    </div>
  );
}

function CreateUserCard() {
  const fn = useServerFn(adminCreateUser);
  const qc = useQueryClient();
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "employee" as Role });

  const m = useMutation({
    mutationFn: async () => fn({ data: form }),
    onSuccess: () => {
      toast.success("User created");
      setForm({ full_name: "", email: "", password: "", role: "employee" });
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
        <div className="md:col-span-2">
          <Button type="submit" disabled={m.isPending}>{m.isPending ? "Creating…" : "Create user"}</Button>
        </div>
      </form>
    </Card>
  );
}

function UsersListCard() {
  const fn = useServerFn(adminListUsers);
  const { data } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => fn(),
  });
  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">All users</h2>
      </div>
      <div className="divide-y divide-border">
        {(data ?? []).map((u: any) => (
          <div key={u.id} className="flex items-center justify-between py-3">
            <div>
              <div className="text-sm font-medium">{u.full_name || u.email}</div>
              <div className="text-xs text-muted-foreground">{u.email}</div>
            </div>
            <div className="flex gap-1">
              {(u.roles ?? []).map((r: string) => (
                <Badge key={r} variant={r === "admin" ? "default" : "secondary"}>{r}</Badge>
              ))}
            </div>
          </div>
        ))}
        {!data?.length && <div className="py-6 text-center text-sm text-muted-foreground">No users yet.</div>}
      </div>
    </Card>
  );
}

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<any[] | null>(null);

  const m = useMutation({
    mutationFn: async (rows: any[]) => fn({ data: { rows } }),
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
            <Button onClick={() => m.mutate(preview)} disabled={m.isPending}>
              {m.isPending ? "Importing…" : `Import ${preview.length} customers`}
            </Button>
            <Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
