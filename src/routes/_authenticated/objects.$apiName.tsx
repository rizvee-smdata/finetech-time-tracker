import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Boxes, Plus, Trash2, Pencil, Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  getObject, listFields, listRecords, upsertRecord, deleteRecord,
} from "@/lib/custom-objects/objects.functions";

export const Route = createFileRoute("/_authenticated/objects/$apiName")({
  head: ({ params }) => ({ meta: [{ title: `${params.apiName} — Records` }] }),
  component: RecordsPage,
});

function RecordsPage() {
  const { apiName } = Route.useParams();
  const { companyId } = useAuth();
  const qc = useQueryClient();
  const getObj = useServerFn(getObject);
  const listF = useServerFn(listFields);
  const listR = useServerFn(listRecords);
  const upsertR = useServerFn(upsertRecord);
  const delR = useServerFn(deleteRecord);

  const obj = useQuery({
    queryKey: ["custom-object-by-name", apiName, companyId],
    queryFn: () => getObj({ data: { apiName, companyId: companyId! } }),
    enabled: !!companyId,
  });

  const fields = useQuery({
    queryKey: ["custom-object-fields", obj.data?.id],
    queryFn: () => listF({ data: { objectId: obj.data!.id } }),
    enabled: !!obj.data?.id,
  });

  const records = useQuery({
    queryKey: ["custom-object-records", obj.data?.id],
    queryFn: () => listR({ data: { objectId: obj.data!.id, companyId: companyId! } }),
    enabled: !!obj.data?.id && !!companyId,
  });

  const [dlg, setDlg] = useState<{ open: boolean; editing: any | null }>({ open: false, editing: null });
  const [values, setValues] = useState<Record<string, any>>({});

  const upsert = useMutation({
    mutationFn: () => upsertR({ data: {
      id: dlg.editing?.id,
      objectId: obj.data!.id,
      companyId: companyId!,
      data: values,
    } }),
    onSuccess: () => {
      toast.success(dlg.editing ? "Record saved" : "Record created");
      setDlg({ open: false, editing: null });
      setValues({});
      qc.invalidateQueries({ queryKey: ["custom-object-records", obj.data?.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delR({ data: { id } }),
    onSuccess: () => { toast.success("Record deleted"); qc.invalidateQueries({ queryKey: ["custom-object-records", obj.data?.id] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const displayFields = useMemo(
    () => (fields.data ?? []).slice(0, 5),
    [fields.data],
  );

  function openCreate() {
    setValues({});
    setDlg({ open: true, editing: null });
  }
  function openEdit(row: any) {
    setValues(row.data ?? {});
    setDlg({ open: true, editing: row });
  }

  if (!companyId) return <p className="p-6 text-sm text-muted-foreground">Select a company first.</p>;
  if (obj.isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (!obj.data) return <p className="p-6 text-sm text-destructive">Object not found.</p>;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Boxes className="h-6 w-6" /> {obj.data.plural_label}
          </h1>
          {obj.data.description && <p className="text-sm text-muted-foreground">{obj.data.description}</p>}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/settings/custom-objects/$id" params={{ id: obj.data.id }}>
              <Settings2 className="mr-1 h-4 w-4" /> Design
            </Link>
          </Button>
          <Button onClick={openCreate} disabled={(fields.data ?? []).length === 0}>
            <Plus className="mr-1 h-4 w-4" /> New {obj.data.label}
          </Button>
        </div>
      </div>

      {(fields.data ?? []).length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          This object has no fields yet.{" "}
          <Link to="/settings/custom-objects/$id" params={{ id: obj.data.id }} className="underline">Design its fields</Link> to start adding records.
        </Card>
      ) : (records.data ?? []).length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No records yet. Click <b>New {obj.data.label}</b> above.
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                {displayFields.map((f: any) => <TableHead key={f.id}>{f.label}</TableHead>)}
                <TableHead className="text-right">Updated</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(records.data ?? []).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name || "—"}</TableCell>
                  {displayFields.map((f: any) => (
                    <TableCell key={f.id} className="text-sm">{formatValue(r.data?.[f.api_name], f)}</TableCell>
                  ))}
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {new Date(r.updated_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={dlg.open} onOpenChange={(o) => setDlg((d) => ({ ...d, open: o }))}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dlg.editing ? `Edit ${obj.data.label}` : `New ${obj.data.label}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {(fields.data ?? []).map((f: any) => (
              <FieldInput
                key={f.id}
                field={f}
                value={values[f.api_name]}
                onChange={(v) => setValues((prev) => ({ ...prev, [f.api_name]: v }))}
              />
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDlg({ open: false, editing: null })}>Cancel</Button>
            <Button disabled={upsert.isPending} onClick={() => upsert.mutate()}>
              {dlg.editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatValue(v: any, f: any): string {
  if (v == null || v === "") return "—";
  if (f.kind === "boolean") return v ? "Yes" : "No";
  if (f.kind === "multiselect" && Array.isArray(v)) return v.join(", ");
  if (f.kind === "datetime") { try { return new Date(v).toLocaleString(); } catch { return String(v); } }
  return String(v);
}

function FieldInput({ field, value, onChange }: { field: any; value: any; onChange: (v: any) => void }) {
  const label = (
    <Label className="mb-1 block text-xs">
      {field.label} {field.required && <span className="text-destructive">*</span>}
    </Label>
  );
  switch (field.kind as string) {
    case "textarea":
      return <div>{label}<Textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} rows={3} /></div>;
    case "number":
      return <div>{label}<Input type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} /></div>;
    case "date":
      return <div>{label}<Input type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value)} /></div>;
    case "datetime":
      return <div>{label}<Input type="datetime-local" value={value ?? ""} onChange={(e) => onChange(e.target.value)} /></div>;
    case "boolean":
      return <div className="flex items-center justify-between rounded border p-2">
        <span className="text-sm">{field.label}</span>
        <Switch checked={!!value} onCheckedChange={onChange} />
      </div>;
    case "select":
      return <div>{label}
        <Select value={value ?? ""} onValueChange={onChange}>
          <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((o: string) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>;
    case "multiselect": {
      const arr: string[] = Array.isArray(value) ? value : [];
      return <div>{label}
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((o: string) => {
            const on = arr.includes(o);
            return (
              <button
                key={o} type="button"
                onClick={() => onChange(on ? arr.filter((x) => x !== o) : [...arr, o])}
                className={`rounded border px-2 py-1 text-xs ${on ? "bg-primary text-primary-foreground" : ""}`}
              >{o}</button>
            );
          })}
        </div>
      </div>;
    }
    case "url":
      return <div>{label}<Input type="url" value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="https://" /></div>;
    case "email":
      return <div>{label}<Input type="email" value={value ?? ""} onChange={(e) => onChange(e.target.value)} /></div>;
    case "phone":
      return <div>{label}<Input type="tel" value={value ?? ""} onChange={(e) => onChange(e.target.value)} /></div>;
    case "reference":
      return <div>{label}<Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="Related record ID" /></div>;
    default:
      return <div>{label}<Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} /></div>;
  }
}
