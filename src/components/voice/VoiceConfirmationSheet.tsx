import { useEffect, useMemo, useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Plus, Smile, Meh, Frown, Loader2, Trash2, PencilLine, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { useServerFn } from "@tanstack/react-start";
import { saveVoiceInputRecords, discardVoiceInput } from "@/lib/voice.functions";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

export type VoiceInputRecord = {
  id: string;
  transcript_bn: string | null;
  transcript_en: string | null;
  detected_language: string | null;
  extracted_data: any;
  confidence_scores: any;
  audio_path: string | null;
  duration_seconds: number | null;
};

type ActionItem = { task: string; due_days: number; done?: boolean };

function ConfBadge({ score }: { score?: number }) {
  const s = typeof score === "number" ? score : 0;
  const color = s >= 0.8 ? "bg-emerald-500" : s >= 0.5 ? "bg-amber-500" : "bg-rose-500";
  const label = s >= 0.8 ? "High confidence" : s >= 0.5 ? "Verify" : "Low confidence";
  return <span title={label} className={cn("inline-block h-2 w-2 rounded-full", color)} />;
}

const SENTIMENTS = [
  { value: "happy", label: "Happy", Icon: Smile, color: "text-emerald-500" },
  { value: "neutral", label: "Neutral", Icon: Meh, color: "text-muted-foreground" },
  { value: "concerned", label: "Concerned", Icon: Frown, color: "text-rose-500" },
] as const;

export function VoiceConfirmationSheet({
  record,
  open,
  onOpenChange,
}: {
  record: VoiceInputRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user, companyId } = useAuth();
  const navigate = useNavigate();
  const saveFn = useServerFn(saveVoiceInputRecords);
  const discardFn = useServerFn(discardVoiceInput);

  const ed = record?.extracted_data ?? {};
  const conf = record?.confidence_scores ?? {};

  const [clientName, setClientName] = useState<string>("");
  const [linkedContactId, setLinkedContactId] = useState<string>("__new");
  const [summary, setSummary] = useState("");
  const [requirements, setRequirements] = useState<string[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [followup, setFollowup] = useState<string>("");
  const [sentiment, setSentiment] = useState<"happy" | "neutral" | "concerned">("neutral");
  const [newReq, setNewReq] = useState("");
  const [newProd, setNewProd] = useState("");
  const [saving, setSaving] = useState(false);
  const [showBangla, setShowBangla] = useState(true);

  useEffect(() => {
    if (!record) return;
    setClientName(ed.client_name ?? "");
    setSummary(ed.visit_summary ?? "");
    setRequirements(Array.isArray(ed.requirements) ? ed.requirements : []);
    setProducts(Array.isArray(ed.products_discussed) ? ed.products_discussed : []);
    setActions(
      Array.isArray(ed.action_items)
        ? ed.action_items.map((a: any) => ({ task: String(a.task ?? ""), due_days: Number(a.due_days ?? 7) }))
        : [],
    );
    setSentiment(["happy", "neutral", "concerned"].includes(ed.sentiment) ? ed.sentiment : "neutral");
    if (typeof ed.followup_date_days === "number") {
      const d = new Date();
      d.setDate(d.getDate() + ed.followup_date_days);
      setFollowup(d.toISOString().slice(0, 10));
    } else {
      setFollowup("");
    }
    setLinkedContactId("__new");
    setShowBangla(record.detected_language !== "en");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id]);

  const customersQuery = useQuery({
    queryKey: ["voice-customers-quick", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("customer_visits")
        .select("customer_name")
        .order("created_at", { ascending: false })
        .limit(50);
      const uniq = Array.from(new Set((data ?? []).map((r) => r.customer_name).filter(Boolean))) as string[];
      return uniq;
    },
    enabled: open && !!user,
  });

  const displayTranscript = useMemo(() => {
    if (!record) return "";
    return showBangla ? record.transcript_bn || record.transcript_en || "" : record.transcript_en || record.transcript_bn || "";
  }, [record, showBangla]);

  async function handleSave() {
    if (!record) return;
    if (!summary.trim()) {
      toast.error("Visit summary cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      const res = await saveFn({
        data: {
          voiceInputId: record.id,
          clientName: clientName.trim() || null,
          visitSummary: summary,
          requirements,
          productsDiscussed: products,
          actionItems: actions.map((a) => ({ task: a.task, dueDays: a.due_days })),
          followupDate: followup || null,
          sentiment,
          companyId: companyId ?? null,
        },
      });
      toast.success(
        `Saved! Created visit${res.taskIds?.length ? ` + ${res.taskIds.length} task${res.taskIds.length > 1 ? "s" : ""}` : ""}.`,
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDiscard() {
    if (!record) return;
    if (!confirm("Discard this voice note? The recording and transcript will be deleted.")) return;
    try {
      await discardFn({ data: { voiceInputId: record.id } });
      toast.success("Discarded.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to discard.");
    }
  }

  if (!record) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>Review voice note</DrawerTitle>
          <DrawerDescription>
            Verify what the AI extracted, then save to create your visit report + tasks.
          </DrawerDescription>
        </DrawerHeader>

        <div className="space-y-4 overflow-y-auto px-4 pb-4">
          {/* Transcript */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase text-muted-foreground">Transcript</div>
              {record.transcript_bn && record.transcript_en && (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant={showBangla ? "default" : "outline"}
                    className="h-6 px-2 text-[11px]"
                    onClick={() => setShowBangla(true)}
                  >
                    বাংলা
                  </Button>
                  <Button
                    size="sm"
                    variant={!showBangla ? "default" : "outline"}
                    className="h-6 px-2 text-[11px]"
                    onClick={() => setShowBangla(false)}
                  >
                    EN
                  </Button>
                </div>
              )}
            </div>
            <p
              className={cn("whitespace-pre-wrap text-sm leading-relaxed", showBangla && "font-bangla")}
              style={showBangla ? { fontFamily: "'Hind Siliguri', 'SolaimanLipi', system-ui, sans-serif" } : undefined}
            >
              {displayTranscript || <span className="text-muted-foreground">No transcript.</span>}
            </p>
          </div>

          {/* Client */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2 text-xs">
              Client <ConfBadge score={conf.client_name} />
            </Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input
                placeholder="Client name"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />
              <Select value={linkedContactId} onValueChange={setLinkedContactId}>
                <SelectTrigger>
                  <SelectValue placeholder="Link to existing CRM contact" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__new">+ Create new</SelectItem>
                  {(customersQuery.data ?? []).map((c) => (
                    <SelectItem key={c} value={c} onClick={() => setClientName(c)}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Summary */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2 text-xs">
              Visit summary <ConfBadge score={conf.visit_summary} />
            </Label>
            <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </div>

          {/* Requirements */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2 text-xs">
              Requirements mentioned <ConfBadge score={conf.requirements} />
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {requirements.map((r, i) => (
                <Badge key={`${r}-${i}`} variant="secondary" className="gap-1 pr-1">
                  {r}
                  <button
                    onClick={() => setRequirements(requirements.filter((_, j) => j !== i))}
                    className="rounded-full p-0.5 hover:bg-background"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-1.5">
              <Input
                placeholder="Add requirement"
                value={newReq}
                onChange={(e) => setNewReq(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newReq.trim()) {
                    setRequirements([...requirements, newReq.trim()]);
                    setNewReq("");
                  }
                }}
                className="h-8 text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (newReq.trim()) {
                    setRequirements([...requirements, newReq.trim()]);
                    setNewReq("");
                  }
                }}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Products */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2 text-xs">
              Products discussed <ConfBadge score={conf.products_discussed} />
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {products.map((p, i) => (
                <Badge key={`${p}-${i}`} className="gap-1 pr-1">
                  {p}
                  <button
                    onClick={() => setProducts(products.filter((_, j) => j !== i))}
                    className="rounded-full p-0.5 hover:bg-primary/80"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-1.5">
              <Input
                placeholder="Add product (Fortinet, Rubrik, …)"
                value={newProd}
                onChange={(e) => setNewProd(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newProd.trim()) {
                    setProducts([...products, newProd.trim()]);
                    setNewProd("");
                  }
                }}
                className="h-8 text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (newProd.trim()) {
                    setProducts([...products, newProd.trim()]);
                    setNewProd("");
                  }
                }}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Action items */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2 text-xs">
              Action items <ConfBadge score={conf.action_items} />
            </Label>
            <div className="space-y-2">
              {actions.map((a, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md border p-2">
                  <Checkbox
                    checked={!!a.done}
                    onCheckedChange={(v) =>
                      setActions(actions.map((x, j) => (j === i ? { ...x, done: !!v } : x)))
                    }
                  />
                  <Input
                    value={a.task}
                    onChange={(e) => setActions(actions.map((x, j) => (j === i ? { ...x, task: e.target.value } : x)))}
                    className="h-8 flex-1 text-sm"
                  />
                  <Input
                    type="number"
                    min={0}
                    max={365}
                    value={a.due_days}
                    onChange={(e) =>
                      setActions(actions.map((x, j) => (j === i ? { ...x, due_days: Number(e.target.value) || 0 } : x)))
                    }
                    className="h-8 w-20 text-sm"
                    title="Days from today"
                  />
                  <Button size="icon" variant="ghost" onClick={() => setActions(actions.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setActions([...actions, { task: "", due_days: 7 }])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add action
              </Button>
            </div>
          </div>

          {/* Follow-up + sentiment */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2 text-xs">
                Follow-up date <ConfBadge score={conf.followup_date} />
              </Label>
              <Input type="date" value={followup} onChange={(e) => setFollowup(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2 text-xs">
                Sentiment <ConfBadge score={conf.sentiment} />
              </Label>
              <div className="flex gap-1.5">
                {SENTIMENTS.map(({ value, label, Icon, color }) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={sentiment === value ? "default" : "outline"}
                    onClick={() => setSentiment(value)}
                    className="flex-1 gap-1.5"
                  >
                    <Icon className={cn("h-4 w-4", sentiment !== value && color)} />
                    <span className="text-xs">{label}</span>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 flex flex-col gap-2 border-t bg-background p-3 sm:flex-row">
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save All
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate({ to: "/voice/history" })}
            className="flex-1 sm:flex-none"
          >
            <PencilLine className="mr-2 h-4 w-4" />
            History
          </Button>
          <Button variant="ghost" onClick={handleDiscard} className="text-destructive sm:flex-none">
            <Trash2 className="mr-2 h-4 w-4" />
            Discard
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
