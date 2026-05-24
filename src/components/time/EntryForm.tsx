import { useState } from "react";
import { Sparkles, X, Check } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { TIME_CATEGORIES, type TimeCategory } from "@/lib/time/types";
import { classifyTimeEntry } from "@/lib/time/classify.functions";
import { useDealsStore } from "@/lib/deals/storage";

export type EntryFields = {
  description: string;
  category: TimeCategory;
  billable: boolean;
  dealId?: string;
  tags: string[];
};

type Props = {
  values: EntryFields;
  onChange: (next: EntryFields) => void;
};

type Suggestion = {
  category: string;
  billable: boolean;
  suggestedDealId: string;
  suggestedClientName: string;
  tags: string[];
  confidence: number;
};

export function EntryForm({ values, onChange }: Props) {
  const { deals } = useDealsStore();
  const classify = useServerFn(classifyTimeEntry);
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

  async function runClassify() {
    if (!values.description.trim()) {
      toast.error("Describe what you're working on first.");
      return;
    }
    setLoading(true);
    try {
      const result = await classify({
        data: {
          description: values.description,
          deals: deals.filter((d) => d.stage !== "Closed Won" && d.stage !== "Closed Lost").map((d) => ({
            id: d.id, title: d.title, clientCompany: d.clientCompany,
          })),
        },
      });
      setSuggestion(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI classify failed");
    } finally {
      setLoading(false);
    }
  }

  function applySuggestion() {
    if (!suggestion) return;
    onChange({
      ...values,
      category: (TIME_CATEGORIES as readonly string[]).includes(suggestion.category) ? (suggestion.category as TimeCategory) : values.category,
      billable: suggestion.billable,
      dealId: suggestion.suggestedDealId || values.dealId,
      tags: suggestion.tags.length ? suggestion.tags : values.tags,
    });
    setSuggestion(null);
    toast.success("Applied AI suggestion");
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="What are you working on? e.g. Jamuna Bank proposal review"
          value={values.description}
          onChange={(e) => onChange({ ...values, description: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Tab" && values.description.trim() && !loading) {
              e.preventDefault();
              runClassify();
            }
          }}
          className="bg-background"
        />
        <Button onClick={runClassify} disabled={loading} variant="secondary" className="shrink-0">
          <Sparkles className="mr-1 h-4 w-4 text-amber-400" />
          {loading ? "Classifying…" : "AI Classify"}
        </Button>
      </div>

      {suggestion && (
        <div className="flex items-center gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
          <Sparkles className="h-4 w-4 shrink-0 text-amber-400" />
          <div className="flex-1 text-amber-100">
            <span className="font-medium">AI suggests:</span>{" "}
            {suggestion.category}
            {suggestion.suggestedClientName ? ` · ${suggestion.suggestedClientName}` : ""}
            {" · "}{suggestion.billable ? "Billable" : "Non-billable"}
            {" · "}<span className="text-amber-400">{suggestion.confidence}% confident</span>
          </div>
          <Button size="sm" onClick={applySuggestion} className="h-7 bg-amber-500 hover:bg-amber-400 text-black">
            <Check className="mr-1 h-3 w-3" /> Accept
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSuggestion(null)} className="h-7">
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Category</Label>
          <Select value={values.category} onValueChange={(v) => onChange({ ...values, category: v as TimeCategory })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIME_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Link to deal</Label>
          <Select value={values.dealId ?? "__none"} onValueChange={(v) => onChange({ ...values, dealId: v === "__none" ? undefined : v })}>
            <SelectTrigger className="h-9"><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">None</SelectItem>
              {deals.filter((d) => d.stage !== "Closed Lost").map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.clientCompany} — {d.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Billable</Label>
          <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3">
            <Switch
              checked={values.billable}
              onCheckedChange={(checked) => onChange({ ...values, billable: checked })}
            />
            <span className={values.billable ? "text-sm font-medium text-emerald-400" : "text-sm text-muted-foreground"}>
              {values.billable ? "Billable 💰" : "Non-billable"}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Tags (comma separated)</Label>
        <Input
          value={values.tags.join(", ")}
          onChange={(e) => onChange({ ...values, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
          placeholder="proposal, follow-up"
        />
      </div>
    </div>
  );
}
