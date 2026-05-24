import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, MapPin, TrendingUp } from "lucide-react";
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

  const stats = useQuery({
    queryKey: ["crm-territory-stats", companyId],
    queryFn: async () => {
      const { data } = await sb.from("crm_leads")
        .select("territory_id, expected_value, stage")
        .eq("company_id", companyId);
      const map = new Map<string, { count: number; value: number; won: number; open: number }>();
      let unassigned = { count: 0, value: 0, won: 0, open: 0 };
      for (const l of (data ?? []) as any[]) {
        const key = l.territory_id ?? "__none__";
        const bucket = key === "__none__" ? unassigned : (map.get(key) ?? { count: 0, value: 0, won: 0, open: 0 });
        bucket.count += 1;
        bucket.value += Number(l.expected_value || 0);
        if (l.stage === "won") bucket.won += 1;
        else if (l.stage !== "lost") bucket.open += 1;
        if (key !== "__none__") map.set(key, bucket);
      }
      return { byId: map, unassigned };
    },
    enabled: !!companyId,
  });

  async function remove(id: string) {
    if (!confirm("Delete this territory? Leads in it will be unlinked.")) return;
    const { error } = await sb.from("crm_territories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["crm-territories", companyId] });
    qc.invalidateQueries({ queryKey: ["crm-territory-stats", companyId] });
    toast.success("Deleted");
  }

  const totals = useMemo(() => {
    let count = 0, value = 0;
    for (const b of stats.data?.byId.values() ?? []) { count += b.count; value += b.value; }
    if (stats.data?.unassigned) { count += stats.data.unassigned.count; value += stats.data.unassigned.value; }
    return { count, value };
  }, [stats.data]);

  if (!companyId) return <p className="text-sm text-muted-foreground">Select a company first.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Territories</h2>
          <p className="text-sm text-muted-foreground">
            Group leads geographically or by vertical. {totals.count} leads · ${totals.value.toLocaleString()} pipeline.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />New territory
        </Button>
      </div>

      {(territories.data ?? []).length === 0 && (stats.data?.unassigned.count ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">No territories yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(territories.data ?? []).map((t) => {
            const s = stats.data?.byId.get(t.id) ?? { count: 0, value: 0, won: 0, open: 0 };
            return (
              <Card key={t.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{t.name}</span>
                    </div>
                    {t.description && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</div>}
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
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <Badge variant="secondary">{s.count} leads</Badge>
                  <Badge variant="outline">{s.open} open</Badge>
                  {s.won > 0 && <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 border-emerald-500/30">{s.won} won</Badge>}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1 text-sm font-medium">
                    <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                    ${s.value.toLocaleString()}
                  </div>
                  <Link
                    to="/crm/list"
                    search={{ territory: t.id } as any}
                    className="text-xs text-primary hover:underline"
                  >
                    View leads →
                  </Link>
                </div>
              </Card>
            );
          })}

          {(stats.data?.unassigned.count ?? 0) > 0 && (
            <Card className="p-4 space-y-2 border-dashed">
              <div className="font-medium text-muted-foreground">No territory</div>
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <Badge variant="secondary">{stats.data!.unassigned.count} leads</Badge>
                <Badge variant="outline">{stats.data!.unassigned.open} open</Badge>
              </div>
              <div className="text-sm font-medium">${stats.data!.unassigned.value.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Assign these leads to a territory for clearer reporting.</p>
            </Card>
          )}
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
    qc.invalidateQueries({ queryKey: ["crm-territory-stats", companyId] });
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
