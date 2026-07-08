import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
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
import { Search, Users, Upload, Plus, Pencil, Trash2, Camera, AlertTriangle, Trash, ArrowUp, ArrowDown, ArrowUpDown, Download } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { PaginationBar, usePagination } from "@/components/PageSizeSelect";
import { useServerFn } from "@tanstack/react-start";
import { findCustomerDuplicates } from "@/lib/customer-dedupe.functions";
import { ImportDialog } from "@/components/ContactsManager";
import { exportToExcel, exportToPDF, type ExportRow } from "@/lib/export-utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CustomFieldsSection } from "@/components/form-builder/CustomFieldsSection";

type DuplicateHit = {
  id: string;
  customer_name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  reason: string;
};

export const Route = createFileRoute("/_authenticated/customers")({
  component: CustomersPage,
});

type Customer = {
  id: string;
  customer_name: string;
  contact_person: string | null;
  designation: string | null;
  email: string | null;
  phone: string | null;
};

function CustomersPage() {
  const { companyId, company, isStaff, isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
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

  const { data, isLoading } = useQuery({
    queryKey: ["customers", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const pageSize = 1000;
      const rows: Customer[] = [];

      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("customers")
          .select("id, customer_name, contact_person, designation, email, phone")
          .eq("company_id", companyId!)
          .eq("kind", "customer")
          .order("created_at", { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) throw error;
        rows.push(...((data ?? []) as Customer[]));
        if (!data || data.length < pageSize) break;
      }

      return rows;
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
    toast.success("Customer deleted");
    setDeleting(null);
    qc.invalidateQueries({ queryKey: ["customers", companyId] });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const pageIds = new Set(pg.paged.map((c) => c.id));
    const allSelected = pg.paged.every((c) => selectedIds.has(c.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  async function confirmBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const { error } = await supabase.from("customers").delete().in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`${ids.length} customer${ids.length > 1 ? "s" : ""} deleted`);
    setSelectedIds(new Set());
    setBulkDeleting(false);
    qc.invalidateQueries({ queryKey: ["customers", companyId] });
  }

  function doExport(fmt: "xlsx" | "csv" | "pdf") {
    if (!sorted.length) return;
    const header = ["Customer", "Contact person", "Designation", "Email", "Phone"];
    const rows: ExportRow[] = sorted.map((c) => [
      c.customer_name ?? "",
      c.contact_person ?? "",
      c.designation ?? "",
      c.email ?? "",
      c.phone ?? "",
    ]);
    if (fmt === "xlsx") exportToExcel("customers", "Customers", header, rows);
    else if (fmt === "pdf") exportToPDF("customers", "Customers", header, rows);
    else {
      const esc = (v: any) => {
        const s = String(v ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "customers.csv"; a.click();
      URL.revokeObjectURL(url);
    }
  }

  const pg = usePagination(sorted, 20);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground">
            {company ? <>Showing customers for <span className="font-medium text-foreground">{company.name}</span>. Switch the company in the header to see others.</> : "All customers imported for this company."}
          </p>
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
          {isStaff && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" />Add customer
            </Button>
          )}
          {isStaff && (
            <Button asChild variant="secondary">
              <Link to="/scan"><Camera className="mr-2 h-4 w-4" />Scan card</Link>
            </Button>
          )}
          {isAdmin && (
            <Button variant="outline" onClick={() => setImporting(true)}>
              <Upload className="mr-2 h-4 w-4" />Import customers
            </Button>
          )}
        </div>
      </header>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, contact, email, phone..." className="pl-9" />
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-4 py-2">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button variant="destructive" size="sm" onClick={() => setBulkDeleting(true)}>
            <Trash className="mr-2 h-4 w-4" />Delete selected
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        {!companyId ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Select a company first.</div>
        ) : isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />
            No customers found.{isAdmin && " Import customers from Settings."}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {isStaff && (
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={pg.paged.length > 0 && pg.paged.every((c) => selectedIds.has(c.id))}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all on page"
                    />
                  </TableHead>
                )}
                <TableHead><button type="button" onClick={() => toggleSort("customer_name")} className="inline-flex items-center hover:text-foreground">Customer<SortIcon k="customer_name" /></button></TableHead>
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
                  {isStaff && (
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(c.id)}
                        onCheckedChange={() => toggleSelect(c.id)}
                        aria-label={`Select ${c.customer_name}`}
                      />
                    </TableCell>
                  )}
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

      <PaginationBar {...pg} label="customers" />

      <CustomerFormDialog
        customer={editing}
        companyId={companyId}
        userId={user?.id}
        open={!!editing}
        onClose={() => setEditing(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["customers", companyId] })}
      />

      <CustomerFormDialog
        customer={null}
        companyId={companyId}
        userId={user?.id}
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["customers", companyId] })}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
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

      <AlertDialog open={bulkDeleting} onOpenChange={(o) => !o && setBulkDeleting(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} customer{selectedIds.size > 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              These records will be removed permanently. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBulkDeleting(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImportDialog
        open={importing}
        kind="customer"
        singular="Customer"
        plural="Customers"
        companyId={companyId}
        onClose={() => setImporting(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["customers", companyId] })}
      />
    </div>
  );
}

function CustomerFormDialog({
  customer,
  companyId,
  userId,
  open,
  onClose,
  onSaved,
}: {
  customer: Customer | null;
  companyId: string | null;
  userId: string | undefined;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isCreate = !customer;
  const emptyForm: Customer = {
    id: "",
    customer_name: "",
    contact_person: null,
    designation: null,
    email: null,
    phone: null,
  };
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Customer | null>(isCreate ? emptyForm : customer);
  const [customFields, setCustomFields] = useState<Record<string, unknown>>(
    ((customer as any)?.custom_fields as Record<string, unknown>) ?? {},
  );
  const [dupes, setDupes] = useState<DuplicateHit[] | null>(null);
  const [checking, setChecking] = useState(false);
  const checkDuplicates = useServerFn(findCustomerDuplicates);

  // sync form when customer changes
  if (!isCreate && customer && (!form || form.id !== customer.id)) {
    setForm(customer);
  }

  async function doInsertOrUpdate() {
    if (!form) return;
    setBusy(true);
    try {
      if (isCreate) {
        const { error } = await supabase.from("customers").insert({
          company_id: companyId,
          created_by: userId,
          customer_name: form.customer_name.trim(),
          contact_person: form.contact_person?.trim() || null,
          designation: form.designation?.trim() || null,
          email: form.email?.trim() || null,
          phone: form.phone?.trim() || null,
          kind: "customer",
        });
        if (error) {
          console.error("Customer insert failed", error);
          toast.error(error.message || "Could not save customer");
          return;
        }
        toast.success("Customer created");
      } else {
        const { error } = await supabase
          .from("customers")
          .update({
            customer_name: form.customer_name.trim(),
            contact_person: form.contact_person?.trim() || null,
            designation: form.designation?.trim() || null,
            email: form.email?.trim() || null,
            phone: form.phone?.trim() || null,
          })
          .eq("id", form.id);
        if (error) {
          console.error("Customer update failed", error);
          toast.error(error.message || "Could not update customer");
          return;
        }
        toast.success("Customer updated");
      }
      onSaved();
      onClose();
      if (isCreate) setForm(emptyForm);
      setDupes(null);
    } finally {
      setBusy(false);
    }
  }

  function validateEmail(val: string | null) {
    if (!val || !val.trim()) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
  }
  function validatePhone(val: string | null) {
    if (!val || !val.trim()) return true;
    return /^[+\d\s\-().]{7,}$/.test(val.trim());
  }

  async function save() {
    if (!form) return;
    if (!form.customer_name?.trim()) return toast.error("Customer name is required");
    if (form.email && !validateEmail(form.email)) return toast.error("Invalid email format");
    if (form.phone && !validatePhone(form.phone)) return toast.error("Invalid phone number");
    if (isCreate && !companyId) {
      return toast.error("No active company selected. Pick a company in the header first.");
    }
    if (isCreate && !userId) {
      return toast.error("You're not signed in. Please sign in again.");
    }
    if (isCreate) {
      setChecking(true);
      try {
        const res = await checkDuplicates({
          data: {
            companyId: companyId!,
            customer_name: form.customer_name.trim(),
            contact_person: form.contact_person?.trim() || null,
            email: form.email?.trim() || null,
            phone: form.phone?.trim() || null,
          },
        });
        if (res.duplicates && res.duplicates.length > 0) {
          setDupes(res.duplicates as DuplicateHit[]);
          return;
        }
      } catch (e) {
        console.error("Duplicate check failed", e);
      } finally {
        setChecking(false);
      }
    }
    await doInsertOrUpdate();
  }

  const set = (k: keyof Customer) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => (f ? { ...f, [k]: e.target.value } : f));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isCreate ? "Add customer" : "Edit customer"}</DialogTitle>
          <DialogDescription>
            {isCreate ? "Enter new customer details below." : "Update customer details below."}
          </DialogDescription>
        </DialogHeader>
        {form && (
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="cf_name">Customer name *</Label>
              <Input id="cf_name" value={form.customer_name ?? ""} onChange={set("customer_name")} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="cf_person">Contact person</Label>
                <Input id="cf_person" value={form.contact_person ?? ""} onChange={set("contact_person")} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cf_des">Designation</Label>
                <Input id="cf_des" value={form.designation ?? ""} onChange={set("designation")} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cf_email">Email</Label>
                <Input id="cf_email" type="email" value={form.email ?? ""} onChange={set("email")} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cf_phone">Phone</Label>
                <Input id="cf_phone" value={form.phone ?? ""} onChange={set("phone")} />
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || checking}>
            {checking ? "Checking for duplicates..." : busy ? "Saving..." : (isCreate ? "Create" : "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={!!dupes} onOpenChange={(o) => !o && setDupes(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Possible duplicate{(dupes?.length ?? 0) > 1 ? "s" : ""} found
            </AlertDialogTitle>
            <AlertDialogDescription>
              The following customer{(dupes?.length ?? 0) > 1 ? "s" : ""} already exist in your database and look like a match. Please review before creating a new record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-72 overflow-y-auto space-y-2 rounded-md border p-2 bg-muted/30">
            {dupes?.map((d) => (
              <div key={d.id} className="rounded-md bg-background p-2 text-sm border">
                <div className="font-medium">{d.customer_name}</div>
                <div className="text-muted-foreground text-xs">
                  {[d.contact_person, d.email, d.phone].filter(Boolean).join(" · ") || "—"}
                </div>
                <div className="mt-1 text-xs italic text-amber-700 dark:text-amber-400">
                  {d.reason}
                </div>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDupes(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { setDupes(null); await doInsertOrUpdate(); }}>
              Save anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
