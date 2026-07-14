import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Trash2, Star } from "lucide-react";
import { toast } from "sonner";
import { getObject, listFields, upsertField, deleteField, listObjects, type FieldKind } from "@/lib/custom-objects/objects.functions";

export const Route = createFileRoute("/_authenticated/settings/custom-objects/$id")({
  head: () => ({ meta: [{ title: "Object Designer — Settings" }] }),
  component: ObjectDesignerPage,
});

const KINDS: { value: FieldKind; label: string }[] = [
  { value: "text", label: "Text" }, { value: "textarea", label: "Long text" },
  { value: "number", label: "Number" }, { value: "date", label: "Date" },
  { value: "datetime", label: "Date & time" }, { value: "boolean", label: "Yes/No" },
  { value: "select", label: "Single select" }, { value: "multiselect", label: "Multi-select" },
  { value: "url", label: "URL" }, { value: "email", label: "Email" }, { value: "phone", label: "Phone" },
  { value: "reference", label: "Reference to another object" },
];

function ObjectDesignerPage() {
  const { id } = Route.useParams();
  const { companyId } = useAuth();
  const qc = useQueryClient();
  const getObj = useServerFn(getObject);
  const listF = useServerFn(listFields);
  const upsertF = useServerFn(upsertField);
  const delF = useServerFn(deleteField);
  const listObj = useServerFn(listObjects);

  const obj = useQuery({
    queryKey: ["custom-object", id],
    queryFn: () => getObj({ data: { id, companyId: companyId! } }),
    enabled: !!companyId,
  });
  const fields = useQuery({
    queryKey: ["custom-object-fields", id],
    queryFn: () => listF({ data: { objectId: id } }),
  });
  const objects = useQuery({
    queryKey: ["custom-objects", companyId],
    queryFn: () => listObj({ data: { companyId: companyId! } }),
    enabled: !!companyId,
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{
    api_name: string; label: string; kind: FieldKind; required: boolean;
    options: string; reference_object_id: string | null; help_text: string; is_name_field: boolean;
  }>({ api_name: "", label: "", kind: "text", required: false, options: "", reference_object_id: null, help_text: "", is_name_field: false });

  const create = useMutation({
    mutationFn: () => upsertF({ data: {
      object_id: id,
      api_name: form.api_name,
      label: form.label,
      kind: form.kind,
      required: form.required,
      options: form.options ? form.options.split(",").map((s) => s.trim()).filter(Boolean) : [],
      reference_object_id: form.reference_object_id,
      order_index: (fields.data ?? []).length,
      help_text: form.help_text || null,
      is_name_field: form.is_name_field,
    } }),
    onSuccess: () => {
      toast.success("Field added");
      setOpen(false);
      setForm({ api_name: "", label: "", kind: "text", required: false, options: "", reference_object_id: null, help_text: "", is_name_field: false });
      qc.invalidateQueries({ queryKey: ["custom-object-fields", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (fid: string) => delF({ data: { id: fid } }),
    onSuccess: () => { toast.success("Field removed"); qc.invalidateQueries({ queryKey: ["custom-object-fields", id] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const needsOptions = form.kind === "select" || form.kind === "multiselect";
  const needsRef = form.kind === "reference";

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/settings/custom-objects"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link>
        </Button>
      </div>

      {obj.data && (
        <div>
          <h1 className="text-2xl font-semibold">{obj.data.plural_label} — fields</h1>
          <p className="text-sm text-muted-foreground">API name: <code>{obj.data.api_name}</code></p>
        </div>
      )}

      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Add field</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New field</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1 block text-xs">Label</Label>
                  <Input value={form.label} onChange={(e) => {
                    const label = e.target.value;
                    setForm((f) => ({
                      ...f, label,
                      api_name: f.api_name || label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
                    }));
                  }} />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">API name</Label>
                  <Input value={form.api_name} onChange={(e) => setForm({ ...form, api_name: e.target.value })} />
                </div>
              </div>
              <div>
                <Label className="mb-1 block text-xs">Type</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as FieldKind })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {needsOptions && (
                <div>
                  <Label className="mb-1 block text-xs">Options (comma-separated)</Label>
                  <Input value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} placeholder="Low, Medium, High" />
                </div>
              )}
              {needsRef && (
                <div>
                  <Label className="mb-1 block text-xs">References</Label>
                  <Select value={form.reference_object_id ?? ""} onValueChange={(v) => setForm({ ...form, reference_object_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Pick an object" /></SelectTrigger>
                    <SelectContent>
                      {(objects.data ?? []).filter((o: any) => o.id !== id).map((o: any) => (
                        <SelectItem key={o.id} value={o.id}>{o.plural_label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label className="mb-1 block text-xs">Help text (optional)</Label>
                <Input value={form.help_text} onChange={(e) => setForm({ ...form, help_text: e.target.value })} />
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.required} onCheckedChange={(v) => setForm({ ...form, required: v })} /> Required
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.is_name_field} onCheckedChange={(v) => setForm({ ...form, is_name_field: v })} /> Use as record name
                </label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button disabled={!form.label || !form.api_name || create.isPending} onClick={() => create.mutate()}>Add field</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4">
        {fields.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (fields.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No fields yet. Add your first field above.</p>
        ) : (
          <ul className="divide-y">
            {(fields.data ?? []).map((f: any) => (
              <li key={f.id} className="flex items-center gap-3 py-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{f.label}</span>
                    <Badge variant="outline" className="text-xs">{f.kind}</Badge>
                    {f.required && <Badge variant="secondary" className="text-xs">Required</Badge>}
                    {f.is_name_field && (
                      <Badge className="text-xs"><Star className="mr-1 h-3 w-3" /> Name</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <code>{f.api_name}</code>
                    {f.help_text ? ` — ${f.help_text}` : ""}
                    {Array.isArray(f.options) && f.options.length > 0 ? ` — options: ${f.options.join(", ")}` : ""}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove.mutate(f.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
