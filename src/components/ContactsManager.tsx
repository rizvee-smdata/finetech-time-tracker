import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { importCustomers } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, Users, Pencil, Trash2, Plus, Upload, ArrowUpDown, ArrowUp, ArrowDown, Download } from "lucide-react";
import { toast } from "sonner";
import { PaginationBar, usePagination } from "@/components/PageSizeSelect";
import { exportToExcel, exportToPDF, type ExportRow } from "@/lib/export-utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ContactKind = "customer" | "partner" | "consultant";

export type Contact = {
  id: string;
  customer_name: string;
  contact_person: string | null;
  designation: string | null;
  email: string | null;
  phone: string | null;
  kind: ContactKind;
};

export function ContactsManager({
  kind,
  title,
  subtitle,
  singular,
  plural,
}: {
  kind: ContactKind;
  title: string;
  subtitle: string;
  singular: string;
  plural: string;
}) {
  const { companyId, isStaff, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  type SortKey = "customer_name" | "contact_person" | "designation" | "email" | "phone";
  const [sortKey, setSortKey] = useState<SortKey>("customer_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }
  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-50" />;
    return sortDir === "asc"
      ? <ArrowUp className="ml-1 inline h-3 w-3" />
      : <ArrowDown className="ml-1 inline h-3 w-3" />;
  }

  const queryKey = [`contacts-${kind}`, companyId];

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("company_id", companyId!)
        .eq("kind", kind)
        .order("customer_name");
      if (error) throw error;
      return (data ?? []) as Contact[];
    },
  });

  const filtered = (data ?? []).filter((c) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      c.customer_name?.toLowerCase().includes(s) ||
      c.contact_person?.toLowerCase().includes(s) ||
      c.email?.toLowerCase().includes(s) ||
      c.phone?.toLowerCase().includes(s)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const av = (a[sortKey] ?? "").toString().toLowerCase();
    const bv = (b[sortKey] ?? "").toString().toLowerCase();
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  async function confirmDelete() {
    if (!deleting) return;
    const { error } = await supabase.from("customers").delete().eq("id", deleting.id);
    if (error) return toast.error(error.message);
    toast.success(`${singular} deleted`);
    setDeleting(null);
    qc.invalidateQueries({ queryKey });
  }

  const pg = usePagination(sorted, 20);

  function doExport(fmt: "xlsx" | "csv" | "pdf") {
    if (!sorted.length) return;
    const header = [singular, "Contact person", "Designation", "Email", "Phone"];
    const rows: ExportRow[] = sorted.map((c) => [
      c.customer_name ?? "",
      c.contact_person ?? "",
      c.designation ?? "",
      c.email ?? "",
      c.phone ?? "",
    ]);
    const base = plural.toLowerCase().replace(/\s+/g, "-");
    if (fmt === "xlsx") exportToExcel(base, plural, header, rows);
    else if (fmt === "pdf") exportToPDF(base, plural, header, rows);
    else {
      const esc = (v: any) => {
        const s = String(v ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${base}.csv`; a.click();
      URL.revokeObjectURL(url);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isStaff && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={!sorted.length}>
                  <Download className="mr-2 h-4 w-4" />Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => doExport("xlsx")}>Excel (.xlsx)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport("csv")}>CSV (.csv)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport("pdf")}>PDF (.pdf)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {isAdmin && (
            <Button variant="outline" onClick={() => setImporting(true)}>
              <Upload className="mr-2 h-4 w-4" />Import CSV
            </Button>
          )}
          <Button onClick={() => setAdding(true)}>
            <Plus className="mr-2 h-4 w-4" />Add {singular.toLowerCase()}
          </Button>
        </div>

      </header>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, contact, email, phone..." className="pl-9" />
      </div>

      <Card className="p-0 overflow-hidden">
        {!companyId ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Select a company first.</div>
        ) : isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />
            No {plural.toLowerCase()} yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><button type="button" onClick={() => toggleSort("customer_name")} className="inline-flex items-center hover:text-foreground">{singular}<SortIcon k="customer_name" /></button></TableHead>
                <TableHead><button type="button" onClick={() => toggleSort("contact_person")} className="inline-flex items-center hover:text-foreground">Contact person<SortIcon k="contact_person" /></button></TableHead>
                <TableHead><button type="button" onClick={() => toggleSort("designation")} className="inline-flex items-center hover:text-foreground">Designation<SortIcon k="designation" /></button></TableHead>
                <TableHead><button type="button" onClick={() => toggleSort("email")} className="inline-flex items-center hover:text-foreground">Email<SortIcon k="email" /></button></TableHead>
                <TableHead><button type="button" onClick={() => toggleSort("phone")} className="inline-flex items-center hover:text-foreground">Phone<SortIcon k="phone" /></button></TableHead>
                {isStaff && <TableHead className="w-[120px] text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pg.paged.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.customer_name}</TableCell>
                  <TableCell>{c.contact_person || "—"}</TableCell>
                  <TableCell>{c.designation || "—"}</TableCell>
                  <TableCell>{c.email || "—"}</TableCell>
                  <TableCell>{c.phone || "—"}</TableCell>
                  {isStaff && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(c)} aria-label="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleting(c)} aria-label="Delete">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <PaginationBar {...pg} label={plural.toLowerCase()} />

      <ContactDialog
        open={adding}
        kind={kind}
        singular={singular}
        contact={null}
        onClose={() => setAdding(false)}
        onSaved={() => qc.invalidateQueries({ queryKey })}
      />

      <ContactDialog
        open={!!editing}
        kind={kind}
        singular={singular}
        contact={editing}
        onClose={() => setEditing(null)}
        onSaved={() => qc.invalidateQueries({ queryKey })}
      />

      <ImportDialog
        open={importing}
        kind={kind}
        singular={singular}
        plural={plural}
        companyId={companyId}
        onClose={() => setImporting(false)}
        onSaved={() => qc.invalidateQueries({ queryKey })}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {singular.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.customer_name} will be removed permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ContactDialog({
  open, kind, singular, contact, onClose, onSaved,
}: {
  open: boolean;
  kind: ContactKind;
  singular: string;
  contact: Contact | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { companyId, user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Partial<Contact>>(contact ?? {});

  // sync when contact changes
  if (contact && form.id !== contact.id) setForm(contact);
  if (!contact && open && form.id) setForm({});

  function validateEmail(val: string | null) {
    if (!val || !val.trim()) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
  }
  function validatePhone(val: string | null) {
    if (!val || !val.trim()) return true;
    return /^[+\d\s\-().]{7,}$/.test(val.trim());
  }

  async function save() {
    if (!form.customer_name?.trim()) return toast.error(`${singular} name is required`);
    if (form.email && !validateEmail(form.email)) return toast.error("Invalid email format");
    if (form.phone && !validatePhone(form.phone)) return toast.error("Invalid phone number");
    setBusy(true);
    const payload = {
      customer_name: form.customer_name.trim(),
      contact_person: form.contact_person?.trim() || null,
      designation: form.designation?.trim() || null,
      email: form.email?.trim() || null,
      phone: form.phone?.trim() || null,
    };
    const { error } = contact
      ? await supabase.from("customers").update(payload).eq("id", contact.id)
      : await supabase.from("customers").insert({
          ...payload,
          company_id: companyId,
          created_by: user?.id,
          kind,
        });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(contact ? `${singular} updated` : `${singular} added`);
    onSaved();
    onClose();
  }

  const set = (k: keyof Contact) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{contact ? `Edit ${singular.toLowerCase()}` : `Add ${singular.toLowerCase()}`}</DialogTitle>
          <DialogDescription>Fill in the details below.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>{singular} name *</Label>
            <Input value={form.customer_name ?? ""} onChange={set("customer_name")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Contact person</Label>
              <Input value={form.contact_person ?? ""} onChange={set("contact_person")} />
            </div>
            <div className="grid gap-2">
              <Label>Designation</Label>
              <Input value={form.designation ?? ""} onChange={set("designation")} />
            </div>
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input type="email" value={form.email ?? ""} onChange={set("email")} />
            </div>
            <div className="grid gap-2">
              <Label>Phone</Label>
              <Input value={form.phone ?? ""} onChange={set("phone")} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return [];
  const splitLine = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === "," && !inQ) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    // strip BOM, non-breaking spaces, zero-width chars, then trim
    return out.map((s) =>
      s.replace(/^\uFEFF/, "").replace(/[\u00A0\u200B-\u200D\u2060]/g, " ").trim(),
    );
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

export function ImportDialog({
  open, kind, singular, plural, companyId, onClose, onSaved,
}: {
  open: boolean;
  kind: ContactKind;
  singular: string;
  plural: string;
  companyId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fn = useServerFn(importCustomers);
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<any[] | null>(null);

  const m = useMutation({
    mutationFn: async (rows: any[]) => fn({ data: { rows, company_id: companyId, kind } }),
    onSuccess: (res: any) => {
      toast.success(`Imported ${res.inserted} ${plural.toLowerCase()}`);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = "";
      onSaved();
      onClose();
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
        customer_name: mapKey(r, ["customer_name", "customer", "name", "company", `${kind}_name`]),
        contact_person: mapKey(r, ["contact_person", "contact", "contact_name", "person"]),
        designation: mapKey(r, ["designation", "title", "role"]),
        email: mapKey(r, ["email", "email_address", "e-mail"]),
        phone: mapKey(r, ["phone", "phone_number", "mobile", "contact_number"]),
      }))
      .filter((r) => r.customer_name);
    if (!mapped.length) {
      toast.error(`No valid rows found. Required column: ${kind}_name or customer_name`);
      return;
    }
    setPreview(mapped);
  }

  function reset() {
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import {plural.toLowerCase()}</DialogTitle>
          <DialogDescription>
            Upload a CSV with columns: <code className="rounded bg-muted px-1">{kind}_name</code> (or{" "}
            <code className="rounded bg-muted px-1">customer_name</code>),{" "}
            <code className="rounded bg-muted px-1">contact_person</code>,{" "}
            <code className="rounded bg-muted px-1">designation</code>,{" "}
            <code className="rounded bg-muted px-1">email</code>,{" "}
            <code className="rounded bg-muted px-1">phone</code>.
          </DialogDescription>
        </DialogHeader>

        {!companyId && (
          <p className="text-sm text-destructive">Select a company first.</p>
        )}

        <div className="space-y-3">
          <Input ref={inputRef} type="file" accept=".csv,text/csv" onChange={onFile} disabled={!companyId} />
          {preview && (
            <div className="max-h-64 overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{singular}</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.slice(0, 20).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.customer_name}</TableCell>
                      <TableCell>{r.contact_person || "—"}</TableCell>
                      <TableCell>{r.email || "—"}</TableCell>
                      <TableCell>{r.phone || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {preview.length > 20 && (
                <div className="border-t border-border p-2 text-center text-xs text-muted-foreground">
                  +{preview.length - 20} more rows
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button
            onClick={() => preview && m.mutate(preview)}
            disabled={!preview || m.isPending || !companyId}
          >
            {m.isPending ? "Importing..." : preview ? `Import ${preview.length} ${plural.toLowerCase()}` : "Choose a file"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
