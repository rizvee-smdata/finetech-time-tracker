import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { fetchPartners, type CrmPartner } from "@/lib/crm/partners";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/crm/partners")({
  component: PartnersPage,
});

function PartnersPage() {
  const { companyId } = useAuth();
  const partners = useQuery({
    queryKey: ["crm-partners", companyId],
    queryFn: () => fetchPartners(companyId!),
    enabled: !!companyId,
  });
  const [editing, setEditing] = useState<CrmPartner | null>(null);
  const [open, setOpen] = useState(false);

  if (!companyId) return <p className="text-sm text-muted-foreground">Select a company to manage partners.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Partners</h2>
          <p className="text-xs text-muted-foreground">Referral partners and channel partners who source deals. Tag leads with a partner to track their contribution.</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />New Partner
        </Button>
      </div>

      {(partners.data ?? []).length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No partners yet. Add your first one.</Card>
      ) : (
        <div className="grid gap-2">
          {(partners.data ?? []).map((p) => (
            <Card key={p.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{p.name}{p.code ? <span className="ml-2 text-xs text-muted-foreground">[{p.code}]</span> : null}</div>
                <div className="text-xs text-muted-foreground">
                  {[p.contact_name, p.contact_email, p.contact_phone, p.website].filter(Boolean).join(" · ") || "—"}
                </div>
                {p.notes && <p className="text-xs text-muted-foreground mt-1">{p.notes}</p>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setEditing(p); setOpen(true); }}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="outline" onClick={async () => {
                  if (!window.confirm("Remove this partner?")) return;
                  const { error } = await sb.from("crm_partners").update({ is_active: false }).eq("id", p.id);
                  if (error) return toast.error(error.message);
                  toast.success("Removed");
                  partners.refetch();
                }}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <PartnerDialog open={open} onOpenChange={setOpen} companyId={companyId} partner={editing} onSaved={() => partners.refetch()} />
    </div>
  );
}

function PartnerDialog({ open, onOpenChange, companyId, partner, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; companyId: string; partner: CrmPartner | null; onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(partner?.name ?? "");
  const [code, setCode] = useState(partner?.code ?? "");
  const [website, setWebsite] = useState(partner?.website ?? "");
  const [contactName, setContactName] = useState(partner?.contact_name ?? "");
  const [contactEmail, setContactEmail] = useState(partner?.contact_email ?? "");
  const [contactPhone, setContactPhone] = useState(partner?.contact_phone ?? "");
  const [notes, setNotes] = useState(partner?.notes ?? "");
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
    const op = partner
      ? sb.from("crm_partners").update(payload).eq("id", partner.id)
      : sb.from("crm_partners").insert(payload);
    const { error } = await op;
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["crm-partners", companyId] });
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{partner ? "Edit Partner" : "New Partner"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1"><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="grid gap-1"><Label>Code</Label><Input value={code ?? ""} onChange={(e) => setCode(e.target.value)} placeholder="Optional short code" /></div>
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
