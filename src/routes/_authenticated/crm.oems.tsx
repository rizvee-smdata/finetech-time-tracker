import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { fetchOems, type CrmOem } from "@/lib/crm/oems";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/crm/oems")({
  component: OemsPage,
});

function OemsPage() {
  const { companyId } = useAuth();
  const oems = useQuery({
    queryKey: ["crm-oems", companyId],
    queryFn: () => fetchOems(companyId!),
    enabled: !!companyId,
  });
  const [editing, setEditing] = useState<CrmOem | null>(null);
  const [open, setOpen] = useState(false);

  if (!companyId) return <p className="text-sm text-muted-foreground">Select a company to manage OEM/Vendors.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">OEM / Vendors</h2>
          <p className="text-xs text-muted-foreground">Manage the brands you represent. Products link to an OEM.</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />New OEM / Vendor
        </Button>
      </div>

      {(oems.data ?? []).length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No OEM/Vendors yet. Add your first one.</Card>
      ) : (
        <div className="grid gap-2">
          {(oems.data ?? []).map((o) => (
            <Card key={o.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{o.name}{o.code ? <span className="ml-2 text-xs text-muted-foreground">[{o.code}]</span> : null}</div>
                <div className="text-xs text-muted-foreground">
                  {[o.contact_name, o.contact_email, o.contact_phone, o.website].filter(Boolean).join(" · ") || "—"}
                </div>
                {o.notes && <p className="text-xs text-muted-foreground mt-1">{o.notes}</p>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setEditing(o); setOpen(true); }}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="outline" onClick={async () => {
                  if (!window.confirm("Remove this OEM/Vendor?")) return;
                  const { error } = await sb.from("crm_oems").update({ is_active: false }).eq("id", o.id);
                  if (error) return toast.error(error.message);
                  toast.success("Removed");
                  oems.refetch();
                }}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <OemDialog open={open} onOpenChange={setOpen} companyId={companyId} oem={editing} onSaved={() => oems.refetch()} />
    </div>
  );
}

function OemDialog({ open, onOpenChange, companyId, oem, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; companyId: string; oem: CrmOem | null; onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(oem?.name ?? "");
  const [code, setCode] = useState(oem?.code ?? "");
  const [website, setWebsite] = useState(oem?.website ?? "");
  const [contactName, setContactName] = useState(oem?.contact_name ?? "");
  const [contactEmail, setContactEmail] = useState(oem?.contact_email ?? "");
  const [contactPhone, setContactPhone] = useState(oem?.contact_phone ?? "");
  const [notes, setNotes] = useState(oem?.notes ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) return toast.error("Name required");
    setBusy(true);
    const payload = {
      company_id: companyId,
      name: name.trim(),
      code: code || null,
      website: website || null,
      contact_name: contactName || null,
      contact_email: contactEmail || null,
      contact_phone: contactPhone || null,
      notes: notes || null,
      is_active: true,
    };
    const op = oem
      ? sb.from("crm_oems").update(payload).eq("id", oem.id)
      : sb.from("crm_oems").insert(payload);
    const { error } = await op;
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["crm-oems", companyId] });
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{oem ? "Edit OEM/Vendor" : "New OEM/Vendor"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1"><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="grid gap-1"><Label>Code</Label><Input value={code ?? ""} onChange={(e) => setCode(e.target.value)} placeholder="e.g. HP, DELL" /></div>
          </div>
          <div className="grid gap-1"><Label>Website</Label><Input value={website ?? ""} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" /></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1"><Label>Contact name</Label><Input value={contactName ?? ""} onChange={(e) => setContactName(e.target.value)} /></div>
            <div className="grid gap-1"><Label>Email</Label><Input type="email" value={contactEmail ?? ""} onChange={(e) => setContactEmail(e.target.value)} /></div>
            <div className="grid gap-1"><Label>Phone</Label><Input value={contactPhone ?? ""} onChange={(e) => setContactPhone(e.target.value)} /></div>
          </div>
          <div className="grid gap-1"><Label>Notes</Label><Textarea rows={3} value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
