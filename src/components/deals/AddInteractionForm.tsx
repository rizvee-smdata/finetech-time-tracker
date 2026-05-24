import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Interaction, InteractionType, Sentiment } from "@/lib/deals/types";

type Props = {
  onAdd: (i: Omit<Interaction, "id">) => void;
};

const TYPES: InteractionType[] = ["meeting", "email", "call", "demo", "proposal_sent", "follow_up"];

export function AddInteractionForm({ onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<InteractionType>("call");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [sentiment, setSentiment] = useState<Sentiment>("neutral");

  const submit = () => {
    if (!notes.trim()) return;
    onAdd({
      type,
      date: new Date(date).toISOString(),
      notes: notes.trim(),
      sentiment,
      conductedBy: "Me",
    });
    setNotes("");
    setOpen(false);
  };

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Add Interaction
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-blue-500/30 bg-card/50 p-4 backdrop-blur">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <Label className="text-xs">Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as InteractionType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Sentiment</Label>
          <Select value={sentiment} onValueChange={(v) => setSentiment(v as Sentiment)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="positive">Positive</SelectItem>
              <SelectItem value="neutral">Neutral</SelectItem>
              <SelectItem value="negative">Negative</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-xs">Notes</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="What happened in this interaction?"
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={submit}>Save & Recalculate</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}
