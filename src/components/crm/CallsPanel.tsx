import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Phone, MessageCircle, Plus } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const sb = supabase as any;

type Channel = "call" | "whatsapp" | "sms";
type Outcome = "interested" | "follow_up" | "not_interested" | "no_answer";

const OUTCOMES: { value: Outcome; label: string; cls: string }[] = [
  { value: "interested", label: "Interested", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" },
  { value: "follow_up", label: "Follow up", cls: "bg-blue-500/10 text-blue-700 border-blue-500/30" },
  { value: "no_answer", label: "No answer", cls: "bg-amber-500/10 text-amber-700 border-amber-500/30" },
  { value: "not_interested", label: "Not interested", cls: "bg-rose-500/10 text-rose-700 border-rose-500/30" },
];

export function CallsPanel({
  leadId, userId, phone,
}: { leadId: string; userId: string; phone?: string | null }) {
  const qc = useQueryClient();
  const calls = useQuery({
    queryKey: ["crm-calls", leadId],
    queryFn: async () => {
      const { data, error } = await sb
        .from("crm_call_logs")
        .select("*, user:profiles!crm_call_logs_user_id_fkey(full_name,email)")
        .eq("lead_id", leadId)
        .order("called_at", { ascending: false });
      if (error) {
        // fallback without join if FK not named
        const r = await sb.from("crm_call_logs").select("*").eq("lead_id", leadId).order("called_at", { ascending: false });
        return r.data ?? [];
      }
      return data ?? [];
    },
  });

  const [channel, setChannel] = useState<Channel>("call");
  const [outcome, setOutcome] = useState<Outcome>("follow_up");
  const [duration, setDuration] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const { error } = await sb.from("crm_call_logs").insert({
      lead_id: leadId,
      user_id: userId,
      channel,
      outcome,
      duration_minutes: duration ? Number(duration) : null,
      notes: notes || null,
      called_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setNotes(""); setDuration("");
    qc.invalidateQueries({ queryKey: ["crm-calls", leadId] });
    qc.invalidateQueries({ queryKey: ["crm-lead", leadId] });
    toast.success("Logged");
  }

  const waNumber = phone?.replace(/[^\d+]/g, "");

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <Label className="text-xs">Channel</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="call">Phone call</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Outcome</Label>
            <Select value={outcome} onValueChange={(v) => setOutcome(v as Outcome)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {OUTCOMES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Duration (min)</Label>
            <Input type="number" min="0" value={duration} onChange={(e) => setDuration(e.target.value)} className="w-28" />
          </div>
          {phone && (
            <div className="ml-auto flex gap-2">
              <Button asChild size="sm" variant="outline">
                <a href={`tel:${phone}`}><Phone className="mr-2 h-4 w-4" />Call</a>
              </Button>
              {waNumber && (
                <Button asChild size="sm" variant="outline" className="text-emerald-700 border-emerald-500/40">
                  <a href={`https://wa.me/${waNumber.replace(/^\+/, "")}`} target="_blank" rel="noreferrer">
                    <MessageCircle className="mr-2 h-4 w-4" />WhatsApp
                  </a>
                </Button>
              )}
            </div>
          )}
        </div>
        <Textarea rows={2} placeholder="What was discussed?" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Button size="sm" onClick={submit} disabled={busy}><Plus className="mr-2 h-4 w-4" />Log {channel}</Button>
      </Card>

      {(calls.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No calls or messages logged yet.</p>
      ) : (
        <div className="space-y-2">
          {(calls.data ?? []).map((c: any) => {
            const o = OUTCOMES.find((x) => x.value === c.outcome);
            return (
              <Card key={c.id} className="p-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="capitalize">{c.channel}</Badge>
                    {o && <Badge variant="outline" className={o.cls}>{o.label}</Badge>}
                    {c.duration_minutes != null && <span className="text-muted-foreground">{c.duration_minutes} min</span>}
                  </div>
                  <span className="text-muted-foreground">{format(new Date(c.called_at), "PPp")}</span>
                </div>
                {c.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{c.notes}</p>}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
