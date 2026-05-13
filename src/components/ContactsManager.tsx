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
import { Search, Users, Pencil, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

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
  const { companyId, isStaff } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);
  const [adding, setAdding] = useState(false);

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

  async function confirmDelete() {
    if (!deleting) return;
    const { error } = await supabase.from("customers").delete().eq("id", deleting.id);
    if (error) return toast.error(error.message);
    toast.success(`${singular} deleted`);
    setDeleting(null);
    qc.invalidateQueries({ queryKey });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {isStaff && (
          <Button onClick={() => setAdding(true)}>
            <Plus className="mr-2 h-4 w-4" />Add {singular.toLowerCase()}
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
            No {plural.toLowerCase()} yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{singular}</TableHead>
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
        {filtered.length} {filtered.length === 1 ? singular.toLowerCase() : plural.toLowerCase()}
      </div>

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

  async function save() {
    if (!form.customer_name?.trim()) return toast.error(`${singular} name is required`);
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
