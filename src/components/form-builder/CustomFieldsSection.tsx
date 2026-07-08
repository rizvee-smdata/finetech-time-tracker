import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { fetchFieldDefs } from "@/lib/form-builder/api";
import type { FormEntity, FormFieldDef } from "@/lib/form-builder/types";

const sb = supabase as any;

type MemberOption = { id: string; label: string };

export function CustomFieldsSection({
  companyId,
  entity,
  values,
  onChange,
  members,
  title = "Additional fields",
}: {
  companyId: string;
  entity: FormEntity;
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  members?: MemberOption[];
  title?: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["form-field-defs", companyId, entity],
    enabled: !!companyId,
    queryFn: () => fetchFieldDefs(companyId, entity),
  });

  const customFields = useMemo(
    () => (data ?? []).filter((d) => d.field_kind === "custom" && !d.is_hidden),
    [data],
  );

  if (isLoading || customFields.length === 0) return null;

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 text-xs font-semibold text-muted-foreground">{title}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        {customFields.map((d) => (
          <FieldWrap key={d.id} def={d}>
            <FieldControl
              def={d}
              value={values[d.field_key]}
              onChange={(v) => onChange({ ...values, [d.field_key]: v })}
              companyId={companyId}
              entity={entity}
              members={members}
            />
          </FieldWrap>
        ))}
      </div>
    </div>
  );
}

function FieldWrap({ def, children }: { def: FormFieldDef; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label className="text-xs">
        {def.label}
        {def.is_required_override ? " *" : ""}
      </Label>
      {children}
      {def.help_text && <p className="text-[10px] text-muted-foreground">{def.help_text}</p>}
    </div>
  );
}

function FieldControl({
  def,
  value,
  onChange,
  companyId,
  entity,
  members,
}: {
  def: FormFieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  companyId: string;
  entity: FormEntity;
  members?: MemberOption[];
}) {
  switch (def.field_type) {
    case "textarea":
      return (
        <Textarea
          rows={3}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder ?? ""}
        />
      );
    case "number":
      return (
        <Input
          type="number"
          value={value == null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          placeholder={def.placeholder ?? ""}
        />
      );
    case "date":
      return (
        <Input
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "datetime":
      return (
        <Input
          type="datetime-local"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "boolean":
      return (
        <div className="flex items-center gap-2 h-9">
          <Checkbox
            checked={Boolean(value)}
            onCheckedChange={(c) => onChange(Boolean(c))}
          />
          <span className="text-xs text-muted-foreground">{def.placeholder ?? "Yes"}</span>
        </div>
      );
    case "select": {
      const opts = def.options ?? [];
      return (
        <Select
          value={typeof value === "string" ? value : ""}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger>
            <SelectValue placeholder={def.placeholder ?? "Select…"} />
          </SelectTrigger>
          <SelectContent>
            {opts.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    case "multiselect": {
      const opts = def.options ?? [];
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-2 rounded-md border p-2">
          {opts.map((o) => {
            const on = arr.includes(o.value);
            return (
              <button
                type="button"
                key={o.value}
                onClick={() =>
                  onChange(on ? arr.filter((x) => x !== o.value) : [...arr, o.value])
                }
                className={`px-2 py-1 rounded text-xs border transition ${
                  on
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-accent"
                }`}
              >
                {o.label}
              </button>
            );
          })}
          {opts.length === 0 && (
            <span className="text-xs text-muted-foreground">No options configured</span>
          )}
        </div>
      );
    }
    case "user": {
      return (
        <Select
          value={typeof value === "string" ? value : ""}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select team member" />
          </SelectTrigger>
          <SelectContent>
            {(members ?? []).map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    case "file":
      return (
        <FileField
          value={value as { path: string; name: string } | null}
          onChange={onChange}
          companyId={companyId}
          entity={entity}
          fieldKey={def.field_key}
        />
      );
    case "text":
    default:
      return (
        <Input
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder ?? ""}
        />
      );
  }
}

function FileField({
  value,
  onChange,
  companyId,
  entity,
  fieldKey,
}: {
  value: { path: string; name: string } | null;
  onChange: (v: unknown) => void;
  companyId: string;
  entity: FormEntity;
  fieldKey: string;
}) {
  const busy = false;
  async function upload(file: File) {
    const ext = file.name.split(".").pop() || "bin";
    const path = `${companyId}/${entity}/${fieldKey}/${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from("form-uploads").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) {
      toast.error(`Upload failed: ${error.message}`);
      return;
    }
    onChange({ path, name: file.name });
    toast.success("File uploaded");
  }
  return (
    <div className="flex items-center gap-2">
      {value?.name ? (
        <>
          <span className="text-xs truncate flex-1">{value.name}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange(null)}
          >
            <X className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <label className="inline-flex items-center gap-2 text-xs cursor-pointer border rounded-md px-3 py-2 hover:bg-accent">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <span>Upload file</span>
          <input
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
        </label>
      )}
    </div>
  );
}
