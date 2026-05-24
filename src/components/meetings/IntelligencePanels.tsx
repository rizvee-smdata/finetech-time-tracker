import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useMeetingsStore } from "@/lib/meetings/storage";
import { Pencil, Plus, X, Check } from "lucide-react";
import type { Meeting, ProcessedMeeting } from "@/lib/meetings/types";

type ListField = "painPoints" | "objections" | "nextSteps";

function EditableList({
  meeting,
  field,
  title,
  icon,
  borderColor,
}: {
  meeting: Meeting;
  field: ListField;
  title: string;
  icon: string;
  borderColor: string;
}) {
  const { setProcessedField } = useMeetingsStore();
  const items = (meeting.processed?.[field] as string[]) ?? [];
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  const startEdit = (i: number) => {
    setEditingIdx(i);
    setDraft(items[i]);
  };
  const save = () => {
    if (editingIdx === null) return;
    const next = [...items];
    if (draft.trim()) next[editingIdx] = draft.trim();
    setProcessedField(meeting.id, field, next as ProcessedMeeting[ListField]);
    setEditingIdx(null);
  };
  const remove = (i: number) => {
    setProcessedField(meeting.id, field, items.filter((_, j) => j !== i) as ProcessedMeeting[ListField]);
  };
  const add = () => {
    if (!draft.trim()) return setAdding(false);
    setProcessedField(meeting.id, field, [...items, draft.trim()] as ProcessedMeeting[ListField]);
    setDraft("");
    setAdding(false);
  };

  return (
    <Card className={`border-border/60 bg-card/60 backdrop-blur border-t-2 ${borderColor}`}>
      <CardContent className="space-y-2 p-4">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            <span className="mr-1">{icon}</span> {title}
          </h3>
          <Button size="sm" variant="ghost" onClick={() => { setAdding(true); setDraft(""); }}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        {items.length === 0 && !adding && (
          <p className="text-xs text-muted-foreground">None identified.</p>
        )}
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="rounded-md border border-border/50 bg-background/30 p-2 text-sm">
              {editingIdx === i ? (
                <div className="space-y-1.5">
                  <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-[60px]" />
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary" onClick={save}><Check className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingIdx(null)}><X className="h-3 w-3" /></Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <span className="flex-1">{it}</span>
                  <div className="flex shrink-0 gap-0.5 opacity-60">
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => startEdit(i)}><Pencil className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => remove(i)}><X className="h-3 w-3" /></Button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {adding && (
            <div className="space-y-1.5 rounded-md border border-border/50 bg-background/30 p-2">
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="New item…" className="min-h-[60px]" />
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" onClick={add}><Check className="h-3 w-3" /></Button>
                <Button size="sm" variant="ghost" onClick={() => setAdding(false)}><X className="h-3 w-3" /></Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function IntelligencePanels({ meeting }: { meeting: Meeting }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <EditableList meeting={meeting} field="painPoints" title="Pain Points" icon="🔴" borderColor="border-t-red-500/60" />
      <EditableList meeting={meeting} field="objections" title="Objections" icon="⚠️" borderColor="border-t-amber-500/60" />
      <EditableList meeting={meeting} field="nextSteps" title="Next Steps" icon="✅" borderColor="border-t-emerald-500/60" />
    </div>
  );
}
