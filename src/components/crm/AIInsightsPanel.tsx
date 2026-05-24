import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Mail, MessageCircle, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { leadInsights, draftFollowup } from "@/lib/crm/ai.functions";

export function AIInsightsPanel({ leadId }: { leadId: string }) {
  const runInsights = useServerFn(leadInsights);
  const runDraft = useServerFn(draftFollowup);

  const [insights, setInsights] = useState<string>("");
  const [loadingInsights, setLoadingInsights] = useState(false);

  const [channel, setChannel] = useState<"email" | "whatsapp">("email");
  const [tone, setTone] = useState<"friendly" | "formal" | "urgent">("friendly");
  const [goal, setGoal] = useState("Re-engage and schedule a 20-minute discovery call.");
  const [draft, setDraft] = useState("");
  const [loadingDraft, setLoadingDraft] = useState(false);

  async function generate() {
    setLoadingInsights(true);
    try {
      const res = await runInsights({ data: { leadId } });
      setInsights(res.text);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to generate insights");
    } finally {
      setLoadingInsights(false);
    }
  }

  async function draftIt() {
    if (!goal.trim()) return toast.error("Describe what you want the message to achieve");
    setLoadingDraft(true);
    try {
      const res = await runDraft({ data: { leadId, channel, tone, goal: goal.trim() } });
      setDraft(res.text);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to draft message");
    } finally {
      setLoadingDraft(false);
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => toast.success("Copied"));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            Deal briefing
          </div>
          <Button size="sm" onClick={generate} disabled={loadingInsights}>
            {loadingInsights ? <Loader2 className="h-4 w-4 animate-spin" /> : (insights ? "Regenerate" : "Generate")}
          </Button>
        </div>
        {insights ? (
          <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed">
            {insights}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Get an AI summary of where this deal stands, key risks, recommended next actions, and an estimated win probability.
          </p>
        )}
        {insights && (
          <Button size="sm" variant="ghost" onClick={() => copy(insights)}>
            <Copy className="mr-2 h-3.5 w-3.5" />Copy
          </Button>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 font-medium">
          {channel === "email" ? <Mail className="h-4 w-4 text-primary" /> : <MessageCircle className="h-4 w-4 text-primary" />}
          Draft follow-up
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1">
            <Label className="text-xs">Channel</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Tone</Label>
            <Select value={tone} onValueChange={(v) => setTone(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="friendly">Friendly</SelectItem>
                <SelectItem value="formal">Formal</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Goal of the message</Label>
          <Textarea rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} />
        </div>
        <Button size="sm" onClick={draftIt} disabled={loadingDraft}>
          {loadingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : "Draft message"}
        </Button>
        {draft && (
          <div className="space-y-2">
            <Textarea rows={10} value={draft} onChange={(e) => setDraft(e.target.value)} className="font-mono text-xs" />
            <Button size="sm" variant="ghost" onClick={() => copy(draft)}>
              <Copy className="mr-2 h-3.5 w-3.5" />Copy
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
