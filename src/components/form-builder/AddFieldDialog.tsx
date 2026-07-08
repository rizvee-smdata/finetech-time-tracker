import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createCustomField } from "@/lib/form-builder/api";
import {
  FIELD_TYPE_LABELS,
  type FormEntity,
  type FormFieldOption,
  type FormFieldType,
} from "@/lib/form-builder/types";

type Props = {
  companyId: string;
  entity: FormEntity;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
};

const TYPES: FormFieldType[] = [
  "text",
  "textarea",
  "number",
  "select",
  "multiselect",
  "date",
  "datetime",
  "boolean",
  "file",
  "user",
];

export function AddFieldDialog({ companyId, entity, open, onOpenChange, onCreated }: Props) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FormFieldType>("text");
  const [help, setHelp] = useState("");
  const [placeholder, setPlaceholder] = useState("");
  const [section, setSection] = useState("Custom");
  const [options, setOptions] = useState<FormFieldOption[]>([{ value: "opt1", label: "Option 1" }]);
  const [saving, setSaving] = useState(false);

  const needsOptions = type === "select" || type === "multiselect";

  function reset() {
    setLabel(""); setType("text"); setHelp(""); setPlaceholder("");
    setSection("Custom"); setOptions([{ value: "opt1", label: "Option 1" }]);
  }

  async function submit() {
    if (!label.trim()) return toast.error("Label is required");
    if (needsOptions && options.length === 0) return toast.error("Add at least one option");
    setSaving(true);
    try {
      await createCustomField({
        companyId, entity,
        label: label.trim(),
        type,
        options: needsOptions ? options.filter((o) => o.value && o.label) : [],
        helpText: help.trim() || undefined,
        placeholder: placeholder.trim() || undefined,
        section: section.trim() || null,
      });
      toast.success("Field added");
      reset(); onCreated(); onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to add field");
    } finally {
      setSaving(false);
    }
  }

  function updateOption(i: number, patch: Partial<FormFieldOption>) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }
  function addOption() {
    setOptions((prev) => [...prev, { value: `opt${prev.length + 1}`, label: `Option ${prev.length + 1}` }]);
  }
  function removeOption(i: number) {
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add custom field</DialogTitle>
          <DialogDescription>
            Custom fields appear on the form alongside built-in fields for everyone in your company.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Preferred Contact Time" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Field type</Label>
              <Select value={type} onValueChange={(v) => setType(v as FormFieldType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{FIELD_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Section (group heading)</Label>
              <Input value={section} onChange={(e) => setSection(e.target.value)} placeholder="Custom" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Placeholder (optional)</Label>
            <Input value={placeholder} onChange={(e) => setPlaceholder(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Help text (optional)</Label>
            <Textarea rows={2} value={help} onChange={(e) => setHelp(e.target.value)} />
          </div>
          {needsOptions && (
            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs">Options</Label>
              {options.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    className="flex-1"
                    placeholder="Display label"
                    value={o.label}
                    onChange={(e) => updateOption(i, { label: e.target.value, value: o.value || e.target.value.toLowerCase().replace(/\s+/g, "_") })}
                  />
                  <Input
                    className="w-32"
                    placeholder="value"
                    value={o.value}
                    onChange={(e) => updateOption(i, { value: e.target.value })}
                  />
                  <Button variant="ghost" size="icon" onClick={() => removeOption(i)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addOption}>
                <Plus className="mr-1 h-4 w-4" /> Add option
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Adding…" : "Add field"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
