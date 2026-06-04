import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { MessageCircle, Mail, Send, Sparkles, Edit, Clock, X, Loader2, AlertCircle, Inbox } from "lucide-react";
import {
  generateFollowupDraft, sendFollowupEmail, syncMyFollowups, priorityClass, whatsappLink, type Followup,
} from "@/lib/followups";

export const Route = createFileRoute("/_authenticated/followups/")({
  component: FollowupsInbox,
});

function FollowupsInbox() {
  const { user, companyId } = useAuth();
  const qc = useQueryClient();
  const [sort, setSort] = useState<"priority" | "overdue" | "value">("priority");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [overdueFilter, setOverdueFilter] = useState<string>("all");
  const [modalFollowup, setModalFollowup] = useState<Followup | null>(null);

  // Auto-sync follow-ups when entering the page
  useEffect(() => {
    if (!user?.id || !companyId) return;
    syncMyFollowups(companyId, user.id).catch(() => {});
  }, [user?.id, companyId]);

  const { data: followups = [], isLoading } = useQuery({
    queryKey: ["followups", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("followups" as never)
        .select("*")
        .eq("rep_id", user!.id)
        .in("status", ["open"])
        .order("priority_score", { ascending: false });
      return (data ?? []) as Followup[];
    },
  });

  const { data: profile } = useQuery({
    queryKey: ["profile-self", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name").eq("id", user!.id).maybeSingle();
      return data;
    },
  });

  const filtered = useMemo(() => {
    let list = [...followups];
    if (channelFilter !== "all") list = list.filter((f) => f.suggested_channel === channelFilter);
    if (overdueFilter === "0-7") list = list.filter((f) => f.days_overdue <= 7);
    if (overdueFilter === "8-14") list = list.filter((f) => f.days_overdue > 7 && f.days_overdue <= 14);
    if (overdueFilter === "15+") list = list.filter((f) => f.days_overdue > 14);
    if (sort === "overdue") list.sort((a, b) => b.days_overdue - a.days_overdue);
    else if (sort === "value") list.sort((a, b) => Number(b.open_deal_value ?? 0) - Number(a.open_deal_value ?? 0));
    else list.sort((a, b) => b.priority_score - a.priority_score);
    return list;
  }, [followups, channelFilter, overdueFilter, sort]);

  const todayCount = followups.filter((f) => f.days_overdue >= 0).length;

  const snooze = useMutation({
    mutationFn: async ({ id, days }: { id: string; days: number }) => {
      const until = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
      const { error } = await supabase.from("followups" as never).update({ status: "snoozed", snoozed_until: until }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Snoozed"); qc.invalidateQueries({ queryKey: ["followups"] }); },
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("followups" as never).update({ status: "dismissed", dismissed_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Dismissed"); qc.invalidateQueries({ queryKey: ["followups"] }); },
  });

  return (
    <div className="container mx-auto py-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Inbox className="h-6 w-6 text-primary" /> Follow-ups
        </h1>
        <p className="text-muted-foreground">
          You have <span className="font-semibold text-foreground">{todayCount}</span> follow-up{todayCount === 1 ? "" : "s"} due today.
        </p>
      </div>

      <Card className="p-3 flex gap-3 flex-wrap items-center">
        <div className="flex items-center gap-2">
          <Label className="text-xs">Sort</Label>
          <Select value={sort} onValueChange={(v) => setSort(v as any)}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">Priority</SelectItem>
              <SelectItem value="overdue">Days overdue</SelectItem>
              <SelectItem value="value">Deal value</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Channel</Label>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="email">Email</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Overdue</Label>
          <Select value={overdueFilter} onValueChange={setOverdueFilter}>
            <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="0-7">0–7 days</SelectItem>
              <SelectItem value="8-14">8–14 days</SelectItem>
              <SelectItem value="15+">15+ days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {isLoading ? (
        <Card className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</Card>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <Inbox className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="font-medium">All caught up</p>
          <p className="text-sm text-muted-foreground">No overdue follow-ups right now.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((f) => (
            <FollowupCard key={f.id} f={f} repName={profile?.full_name ?? "Sales rep"}
              onSend={() => setModalFollowup(f)}
              onSnooze={(d) => snooze.mutate({ id: f.id, days: d })}
              onDismiss={() => dismiss.mutate(f.id)} />
          ))}
        </div>
      )}

      <SendModal
        followup={modalFollowup}
        repName={profile?.full_name ?? "Sales rep"}
        onClose={() => setModalFollowup(null)}
        onSent={() => { qc.invalidateQueries({ queryKey: ["followups"] }); setModalFollowup(null); }}
      />
    </div>
  );
}

function FollowupCard({
  f, repName, onSend, onSnooze, onDismiss,
}: {
  f: Followup; repName: string;
  onSend: () => void; onSnooze: (days: number) => void; onDismiss: () => void;
}) {
  const qc = useQueryClient();
  const [drafting, setDrafting] = useState(false);

  const generate = useMutation({
    mutationFn: async () => {
      setDrafting(true);
      const dealContext = f.open_deal_value ? `Open deal worth ${f.currency} ${Number(f.open_deal_value).toLocaleString()}` : "no open deal currently";
      const res = await generateFollowupDraft({
        rep_name: repName, contact_name: f.contact_name, company: f.company_name ?? "their company",
        days_since_contact: f.days_overdue, last_interaction_type: f.last_interaction_type ?? "discussion",
        deal_context: dealContext, channel: f.suggested_channel,
      });
      const { error } = await supabase.from("followups" as never).update({
        ai_draft: res.message, ai_subject: res.subject ?? null, ai_draft_generated_at: new Date().toISOString(),
      }).eq("id", f.id);
      if (error) throw error;
      return res;
    },
    onSettled: () => setDrafting(false),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["followups"] }),
    onError: (e: any) => toast.error(e?.message ?? "Failed to draft"),
  });

  const preview = f.ai_draft ? f.ai_draft.split("\n").slice(0, 2).join("\n") : null;

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold">{f.contact_name}</h3>
            {f.company_name && <span className="text-sm text-muted-foreground">· {f.company_name}</span>}
            <Badge variant="outline" className={priorityClass(f.priority_score)}>Score {f.priority_score}</Badge>
            <Badge variant="outline" className="gap-1">
              {f.suggested_channel === "whatsapp" ? <MessageCircle className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
              {f.suggested_channel}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
            <span><Clock className="h-3 w-3 inline mr-1" />{f.days_overdue}d overdue</span>
            {f.open_deal_value != null && Number(f.open_deal_value) > 0 && (
              <span className="font-medium text-foreground">{f.currency} {Number(f.open_deal_value).toLocaleString()}</span>
            )}
          </div>

          {preview ? (
            <div className="mt-3 p-3 bg-muted/40 rounded text-sm whitespace-pre-line border-l-2 border-primary/40">
              <Sparkles className="h-3 w-3 inline text-primary mr-1" />
              {preview}
              {f.ai_draft && f.ai_draft.split("\n").length > 2 && <span className="text-muted-foreground"> …</span>}
            </div>
          ) : (
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={() => generate.mutate()} disabled={drafting}>
                {drafting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5 text-primary" />}
                Generate AI Draft
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-3 flex-wrap">
        <Button size="sm" onClick={onSend} disabled={!f.ai_draft}>
          <Send className="h-3.5 w-3.5 mr-1.5" /> Send
        </Button>
        <Button size="sm" variant="outline" onClick={onSend} disabled={!f.ai_draft}>
          <Edit className="h-3.5 w-3.5 mr-1.5" /> Edit Draft
        </Button>
        {f.ai_draft && (
          <Button size="sm" variant="ghost" onClick={() => generate.mutate()} disabled={drafting}>
            <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Regenerate
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline"><Clock className="h-3.5 w-3.5 mr-1.5" /> Snooze</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => onSnooze(3)}>3 days</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSnooze(7)}>7 days</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSnooze(14)}>14 days</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          <X className="h-3.5 w-3.5 mr-1.5" /> Dismiss
        </Button>
      </div>
    </Card>
  );
}

function SendModal({
  followup, repName, onClose, onSent,
}: {
  followup: Followup | null; repName: string;
  onClose: () => void; onSent: () => void;
}) {
  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [recipient, setRecipient] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!followup) return;
    setChannel(followup.suggested_channel);
    setSubject(followup.ai_subject ?? `Following up — ${followup.contact_name}`);
    setMessage(followup.ai_draft ?? "");
    setRecipient(followup.suggested_channel === "whatsapp" ? (followup.phone ?? "") : (followup.email ?? ""));
  }, [followup]);

  if (!followup) return null;

  async function approveSend() {
    if (!followup) return;
    setSending(true);
    try {
      if (channel === "email") {
        if (!recipient) { toast.error("Recipient email required"); setSending(false); return; }
        await sendFollowupEmail({
          recipientEmail: recipient, recipientName: followup.contact_name,
          repName, subject, message,
          idempotencyKey: `followup-${followup.id}-${Date.now()}`,
        });
      } else {
        if (!recipient) { toast.error("Phone number required"); setSending(false); return; }
        window.open(whatsappLink(recipient, message), "_blank");
      }

      await supabase.from("followup_sends" as never).insert({
        company_id: followup.company_id,
        followup_id: followup.id,
        rep_id: followup.rep_id,
        lead_id: followup.lead_id,
        contact_name: followup.contact_name,
        company_name: followup.company_name,
        channel,
        recipient,
        subject: channel === "email" ? subject : null,
        message,
      } as never);

      await supabase.from("followups" as never).update({
        status: "sent", sent_at: new Date().toISOString(),
      }).eq("id", followup.id);

      toast.success(channel === "whatsapp" ? "Opened in WhatsApp" : "Email queued");
      onSent();
    } catch (e: any) {
      toast.error(e?.message ?? "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={!!followup} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send follow-up to {followup.contact_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-2">
            <Button size="sm" variant={channel === "whatsapp" ? "default" : "outline"} onClick={() => setChannel("whatsapp")}>
              <MessageCircle className="h-3.5 w-3.5 mr-1.5" /> WhatsApp
            </Button>
            <Button size="sm" variant={channel === "email" ? "default" : "outline"} onClick={() => setChannel("email")}>
              <Mail className="h-3.5 w-3.5 mr-1.5" /> Email
            </Button>
          </div>

          <div>
            <Label className="text-xs">{channel === "whatsapp" ? "Phone (with country code)" : "Recipient email"}</Label>
            <Input value={recipient} onChange={(e) => setRecipient(e.target.value)}
              placeholder={channel === "whatsapp" ? "8801XXXXXXXXX" : "name@example.com"} />
          </div>

          {channel === "email" && (
            <div>
              <Label className="text-xs">Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
          )}

          <div>
            <Label className="text-xs flex items-center gap-1">
              Message <Sparkles className="h-3 w-3 text-primary" />
            </Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={8} />
          </div>

          {channel === "whatsapp" && (
            <Card className="p-3 bg-green-500/5 border-green-500/20">
              <div className="text-xs text-muted-foreground mb-1">WhatsApp preview</div>
              <div className="text-sm whitespace-pre-line">{message || "—"}</div>
            </Card>
          )}

          {channel === "email" && (
            <Card className="p-3 bg-blue-500/5 border-blue-500/20">
              <div className="text-xs text-muted-foreground">Subject</div>
              <div className="font-medium text-sm mb-2">{subject || "—"}</div>
              <div className="text-xs text-muted-foreground">Body</div>
              <div className="text-sm whitespace-pre-line">{message || "—"}</div>
            </Card>
          )}

          {channel === "whatsapp" && (
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              Opens WhatsApp Web/app with the message pre-filled. Tap Send there to deliver.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={approveSend} disabled={sending || !message}>
            {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Approve & Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
