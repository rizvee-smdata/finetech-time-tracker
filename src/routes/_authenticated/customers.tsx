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
import { Search, Users, Upload, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PaginationBar, usePagination } from "@/components/PageSizeSelect";

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
  const { companyId, isStaff, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["customers", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("company_id", companyId!)
        .order("customer_name");
      if (error) throw error;
      return (data ?? []) as Customer[];
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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground">All customers imported for this company.</p>
        </div>
        {isAdmin && (
          <Button asChild variant="outline">
            <Link to="/settings"><Upload className="mr-2 h-4 w-4" />Import customers</Link>
          </Button>
        )}
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
              {filtered.map((c) => (
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

      <div className="text-xs text-muted-foreground">
        {filtered.length} customer{filtered.length === 1 ? "" : "s"}
      </div>

      <EditCustomerDialog
        customer={editing}
        onClose={() => setEditing(null)}
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

function EditCustomerDialog({
  customer, onClose, onSaved,
}: { customer: Customer | null; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Customer | null>(customer);

  // sync form when customer changes
  if (customer && (!form || form.id !== customer.id)) {
    setForm(customer);
  }
  if (!customer && form) setForm(null);

  async function save() {
    if (!form) return;
    if (!form.customer_name?.trim()) return toast.error("Customer name is required");
    setBusy(true);
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
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Customer updated");
    onSaved();
    onClose();
  }

  const set = (k: keyof Customer) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => (f ? { ...f, [k]: e.target.value } : f));

  return (
    <Dialog open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit customer</DialogTitle>
          <DialogDescription>Update customer details below.</DialogDescription>
        </DialogHeader>
        {form && (
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="ec_name">Customer name *</Label>
              <Input id="ec_name" value={form.customer_name ?? ""} onChange={set("customer_name")} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="ec_person">Contact person</Label>
                <Input id="ec_person" value={form.contact_person ?? ""} onChange={set("contact_person")} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ec_des">Designation</Label>
                <Input id="ec_des" value={form.designation ?? ""} onChange={set("designation")} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ec_email">Email</Label>
                <Input id="ec_email" type="email" value={form.email ?? ""} onChange={set("email")} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ec_phone">Phone</Label>
                <Input id="ec_phone" value={form.phone ?? ""} onChange={set("phone")} />
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
