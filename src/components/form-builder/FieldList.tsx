import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowUp, ArrowDown, Eye, EyeOff, Pencil, Check, X, Trash2, Lock } from "lucide-react";
import { toast } from "sonner";
import { FIELD_TYPE_LABELS, type FormFieldDef } from "@/lib/form-builder/types";
import { deleteCustomField, reorderFields, updateFieldDef } from "@/lib/form-builder/api";

type Props = {
  fields: FormFieldDef[];
  onChanged: () => void;
};

export function FieldList({ fields, onChanged }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= fields.length) return;
    const ids = fields.map((f) => f.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setBusy(true);
    try {
      await reorderFields(ids);
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to reorder");
    } finally {
      setBusy(false);
    }
  }

  async function toggleHidden(f: FormFieldDef) {
    if (f.is_system_locked && !f.is_hidden) {
      toast.error("This field is required by the system and can't be hidden.");
      return;
    }
    try {
      await updateFieldDef(f.id, { is_hidden: !f.is_hidden });
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function saveLabel(f: FormFieldDef) {
    if (!draftLabel.trim()) return;
    try {
      await updateFieldDef(f.id, { label: draftLabel.trim() });
      setEditingId(null);
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function remove(f: FormFieldDef) {
    if (f.field_kind === "builtin") {
      toast.error("Built-in fields can't be deleted. Hide them instead.");
      return;
    }
    if (!confirm(`Delete field "${f.label}"? Existing data in this field will be lost.`)) return;
    try {
      await deleteCustomField(f.id);
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  if (fields.length === 0) {
    return <div className="text-sm text-muted-foreground p-6 text-center border rounded-md">No fields yet.</div>;
  }

  // Group by section for readability
  const bySection = fields.reduce<Record<string, FormFieldDef[]>>((acc, f) => {
    const s = f.section ?? "Other";
    (acc[s] ??= []).push(f);
    return acc;
  }, {});

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-4">
        {Object.entries(bySection).map(([section, list]) => (
          <div key={section} className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
              {section}
            </div>
            <Card className="divide-y">
              {list.map((f) => {
                const globalIndex = fields.findIndex((x) => x.id === f.id);
                const isEditing = editingId === f.id;
                return (
                  <div key={f.id} className={`flex items-center gap-2 p-3 ${f.is_hidden ? "opacity-50" : ""}`}>
                    <div className="flex flex-col">
                      <Button variant="ghost" size="icon" className="h-5 w-5" disabled={busy || globalIndex === 0}
                        onClick={() => move(globalIndex, -1)}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-5 w-5" disabled={busy || globalIndex === fields.length - 1}
                        onClick={() => move(globalIndex, 1)}>
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <Input value={draftLabel} onChange={(e) => setDraftLabel(e.target.value)} className="h-8" autoFocus />
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => saveLabel(f)}>
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingId(null)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{f.label}</span>
                          <Button size="icon" variant="ghost" className="h-6 w-6"
                            onClick={() => { setEditingId(f.id); setDraftLabel(f.label); }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {FIELD_TYPE_LABELS[f.field_type]}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] font-normal">
                          {f.field_kind === "builtin" ? "Built-in" : "Custom"}
                        </Badge>
                        {f.is_system_locked && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center text-[10px] text-muted-foreground gap-0.5">
                                <Lock className="h-3 w-3" /> Required by system
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Core field — reports and automations depend on it.</TooltipContent>
                          </Tooltip>
                        )}
                        <span className="text-[10px] text-muted-foreground">key: {f.field_key}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        {f.is_hidden ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                        <Switch
                          checked={!f.is_hidden}
                          onCheckedChange={() => toggleHidden(f)}
                          disabled={f.is_system_locked}
                        />
                      </div>
                      {f.field_kind === "custom" && (
                        <Button variant="ghost" size="icon" onClick={() => remove(f)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </Card>
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}
