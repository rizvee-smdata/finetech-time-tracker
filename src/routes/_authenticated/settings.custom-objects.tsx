import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Boxes, Plus, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { listObjects, upsertObject, deleteObject } from "@/lib/custom-objects/objects.functions";

export const Route = createFileRoute("/_authenticated/settings/custom-objects")({
  head: () => ({ meta: [{ title: "Custom Objects — Settings" }] }),
  component: CustomObjectsPage,
});

function CustomObjectsPage() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listObjects);
  const upsert = useServerFn(upsertObject);
  const del = useServerFn(deleteObject);

  const q = useQuery({
    queryKey: ["custom-objects", companyId],
    queryFn: () => list({ data: { companyId: companyId! } }),
    enabled: !!companyId,
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ api_name: "", label: "", plural_label: "", description: "", icon: "" });

  const create = useMutation({
    mutationFn: () => upsert({ data: { ...form, companyId: companyId!, is_active: true } }),
    onSuccess: () => {
      toast.success("Object created");
      setOpen(false);
      setForm({ api_name: "", label: "", plural_label: "", description: "", icon: "" });
      qc.invalidateQueries({ queryKey: ["custom-objects"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Object deleted"); qc.invalidateQueries({ queryKey: ["custom-objects"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!companyId) return <p className="p-6 text-sm text-muted-foreground">Select a company first.</p>;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Boxes className="h-6 w-6" /> Custom Objects
          </h1>
          <p className="text-sm text-muted-foreground">
            Define your own record types (Projects, Assets, Applications…) with custom fields, relations and access.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> New object</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create custom object</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1 block text-xs">Label (singular)</Label>
                  <Input value={form.label} onChange={(e) => {
                    const label = e.target.value;
                    setForm((f) => ({
                      ...f, label,
                      plural_label: f.plural_label || `${label}s`,
                      api_name: f.api_name || label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
                    }));
                  }} placeholder="Project" />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Label (plural)</Label>
                  <Input value={form.plural_label} onChange={(e) => setForm({ ...form, plural_label: e.target.value })} placeholder="Projects" />
                </div>
              </div>
              <div>
                <Label className="mb-1 block text-xs">API name</Label>
                <Input value={form.api_name} onChange={(e) => setForm({ ...form, api_name: e.target.value })} placeholder="project" />
                <p className="mt-1 text-xs text-muted-foreground">lowercase letters, digits, underscores — used in URLs and integrations.</p>
              </div>
              <div>
                <Label className="mb-1 block text-xs">Description (optional)</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button disabled={!form.label || !form.plural_label || !form.api_name || create.isPending} onClick={() => create.mutate()}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (q.data ?? []).length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No custom objects yet. Create your first one above.
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(q.data ?? []).map((o: any) => (
            <Card key={o.id} className="flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold">{o.plural_label}</h3>
                    {!o.is_active && <Badge variant="secondary">Inactive</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">API: {o.api_name}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove.mutate(o.id)} title="Delete">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {o.description && <p className="text-sm text-muted-foreground line-clamp-2">{o.description}</p>}
              <div className="mt-auto flex gap-2 pt-2">
                <Button asChild variant="outline" size="sm" className="flex-1">
                  <Link to="/settings/custom-objects/$id" params={{ id: o.id }}>Design fields</Link>
                </Button>
                <Button asChild size="sm" className="flex-1">
                  <Link to="/objects/$apiName" params={{ apiName: o.api_name }}>
                    Records <ExternalLink className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
