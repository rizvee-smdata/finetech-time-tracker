import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/crm/territories")({
  component: TerritoriesPage,
});

type Territory = { id: string; name: string; description: string | null };

function TerritoriesPage() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Territory | null>(null);

  const territories = useQuery({
    queryKey: ["crm-territories", companyId],
    queryFn: async () => {
      const { data, error } = await sb.from("crm_territories").select("*").eq("company_id", companyId).order("name");
      if (error) throw error;
      return (data ?? []) as Territory[];
    },
    enabled: !!companyId,
  });

  async function remove(id: string) {
    if (!confirm("Delete this territory?")) return;
    const { error } = await sb.from("crm_territories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["crm-territories", companyId] });
    toast.success("Deleted");
  }

  if (!companyId) return <p className="text-sm text-muted-foreground">Select a company first.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Territories</h2>
          <p className="text-sm text-muted-foreground">Geographic or vertical-based sales territories.</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />New territory
        </Button>
      </div>

      {(territories.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No territories yet.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(territories.data ?? []).map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{t.name}</div>
                  {t.description && <div className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.description}</div>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(t.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <TerritoryDialog open={open} onOpenChange={setOpen} companyId={companyId} editing={editing} />
    </div>
  );
}

function TerritoryDialog({
  open, onOpenChange, companyId, editing,
}: { open: boolean; onOpenChange: (b: boolean) => void; companyId: string; editing: Territory | null }) {
  const qc = useQueryClient();
  const [name, setName] = useState(editing?.name ?? "");
  const [desc, setDesc] = useState(editing?.description ?? "");
  const [busy, setBusy] = useState(false);

  // reset when opening
  if (open && editing && name === "" && editing.name) { setName(editing.name); setDesc(editing.description ?? ""); }

  async function submit() {
    if (!name.trim()) return toast.error("Name required");
    setBusy(true);
    const payload = { name: name.trim(), description: desc.trim() || null, company_id: companyId };
    const op = editing
      ? sb.from("crm_territories").update(payload).eq("id", editing.id)
      : sb.from("crm_territories").insert(payload);
    const { error } = await op;
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Updated" : "Created");
    qc.invalidateQueries({ queryKey: ["crm-territories", companyId] });
    onOpenChange(false);
    setName(""); setDesc("");
  }

  return (
    <Dialog open={open} onOpenChange={(b) => { onOpenChange(b); if (!b) { setName(""); setDesc(""); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} territory</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dhaka North" />
          </div>
          <div className="grid gap-1">
            <Label>Description</Label>
            <Textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{editing ? "Save" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
