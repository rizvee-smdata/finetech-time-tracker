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
import { Search, Users, Upload, Plus, Pencil, Trash2, Camera, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { PaginationBar, usePagination } from "@/components/PageSizeSelect";
import { useServerFn } from "@tanstack/react-start";
import { findCustomerDuplicates } from "@/lib/customer-dedupe.functions";

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
  const [deleting, setDeleting] = useState<Customer | null>(null);

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

  async function confirmDelete() {
    if (!deleting) return;
    const { error } = await supabase.from("customers").delete().eq("id", deleting.id);
    if (error) return toast.error(error.message);
    toast.success("Customer deleted");
    setDeleting(null);
    qc.invalidateQueries({ queryKey: ["customers", companyId] });
  }

  const pg = usePagination(filtered, 20);

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
            <Button asChild variant="outline">
              <Link to="/settings"><Upload className="mr-2 h-4 w-4" />Import customers</Link>
            </Button>
          )}
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
            No customers found.{isAdmin && " Import customers from Settings."}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Contact person</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
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

  async function save() {
    if (!form) return;
    if (!form.customer_name?.trim()) return toast.error("Customer name is required");
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
          <Button onClick={save} disabled={busy}>{busy ? "Saving..." : (isCreate ? "Create" : "Save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
