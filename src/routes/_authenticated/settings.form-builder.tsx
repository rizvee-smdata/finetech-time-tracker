import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Info } from "lucide-react";
import { fetchFieldDefs } from "@/lib/form-builder/api";
import { ENTITY_LABELS, type FormEntity } from "@/lib/form-builder/types";
import { FieldList } from "@/components/form-builder/FieldList";
import { AddFieldDialog } from "@/components/form-builder/AddFieldDialog";

export const Route = createFileRoute("/_authenticated/settings/form-builder")({
  component: FormBuilderPage,
});

const ENTITIES: FormEntity[] = ["lead", "customer", "visit", "expense", "task", "contract"];

function FormBuilderPage() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  const [entity, setEntity] = useState<FormEntity>("lead");
  const [addOpen, setAddOpen] = useState(false);

  const { data: fields, isLoading } = useQuery({
    queryKey: ["form-field-defs", companyId, entity],
    enabled: !!companyId,
    queryFn: () => fetchFieldDefs(companyId!, entity),
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["form-field-defs", companyId, entity] });
  }

  if (!companyId) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Form Builder</h1>
        <p className="text-sm text-muted-foreground">
          Customize the forms your team fills in. Rename built-in fields, hide the ones you don't need,
          reorder them, and add unlimited custom fields.
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Built-in fields can be renamed, reordered, and hidden — but never deleted — so reports, AI insights,
          imports, and automations keep working. A few core fields (e.g. Customer Name, Stage) can't be hidden.
        </AlertDescription>
      </Alert>

      <Card className="p-4 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <Label className="text-xs">Form</Label>
          <Select value={entity} onValueChange={(v) => setEntity(v as FormEntity)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ENTITIES.map((e) => (
                <SelectItem key={e} value={e}>{ENTITY_LABELS[e]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setAddOpen(true)} className="mt-4">
          <Plus className="mr-1 h-4 w-4" /> Add custom field
        </Button>
      </Card>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading fields…</div>
      ) : (
        <FieldList fields={fields ?? []} onChanged={invalidate} />
      )}

      <AddFieldDialog
        companyId={companyId}
        entity={entity}
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={invalidate}
      />
    </div>
  );
}
