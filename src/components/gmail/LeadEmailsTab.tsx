import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { RefreshCw, Sparkles, Paperclip, ArrowDownRight, ArrowUpRight, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { syncGmailForMe } from "@/lib/gmail/sync.functions";
import { summarizeLeadEmails } from "@/lib/gmail/summarize.functions";
import { getMyGmailAccount } from "@/lib/gmail/oauth.functions";

const sb = supabase as any;

export function LeadEmailsTab({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const syncFn = useServerFn(syncGmailForMe);
  const sumFn = useServerFn(summarizeLeadEmails);
  const accFn = useServerFn(getMyGmailAccount);
  const [openThread, setOpenThread] = useState<string | null>(null);

  const account = useQuery({ queryKey: ["gmail-account"], queryFn: () => accFn() });

  const emails = useQuery({
    queryKey: ["lead-emails", leadId],
    queryFn: async () => {
      const { data } = await sb
        .from("lead_emails")
        .select("*")
        .eq("lead_id", leadId)
        .order("sent_at", { ascending: false });
      return data ?? [];
    },
  });

  const summary = useQuery({
    queryKey: ["lead-summary", leadId],
    queryFn: async () => {
      const { data } = await sb
        .from("lead_email_summaries")
        .select("*")
        .eq("lead_id", leadId)
        .maybeSingle();
      return data;
    },
  });

  const sync = useMutation({
    mutationFn: () => syncFn({ data: { leadId } }),
    onSuccess: (r) => {
      toast.success(`Synced — ${r.newEmails} new emails`);
      qc.invalidateQueries({ queryKey: ["lead-emails", leadId] });
      qc.invalidateQueries({ queryKey: ["gmail-account"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Sync failed"),
  });

  const summarize = useMutation({
    mutationFn: () => sumFn({ data: { leadId } }),
    onSuccess: () => {
      toast.success("Summary ready");
      qc.invalidateQueries({ queryKey: ["lead-summary", leadId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Summarize failed"),
  });

  const threads = useMemo(() => {
    const map = new Map<string, any[]>();
    (emails.data ?? []).forEach((m: any) => {
      const arr = map.get(m.gmail_thread_id) ?? [];
      arr.push(m);
      map.set(m.gmail_thread_id, arr);
    });
    return Array.from(map.entries())
      .map(([tid, msgs]) => {
        msgs.sort((a, b) => +new Date(a.sent_at) - +new Date(b.sent_at));
        const last = msgs[msgs.length - 1];
        return { tid, msgs, last };
      })
      .sort((a, b) => +new Date(b.last.sent_at) - +new Date(a.last.sent_at));
  }, [emails.data]);

  const currentThread = openThread ? threads.find((t) => t.tid === openThread) : null;

  const hasGmail = account.data?.status === "connected";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-muted-foreground">
          {account.data?.last_synced_at
            ? `Last synced ${format(new Date(account.data.last_synced_at), "PPp")}`
            : "Never synced"}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => sync.mutate()} disabled={!hasGmail || sync.isPending}>
            <RefreshCw className={`h-4 w-4 mr-1 ${sync.isPending ? "animate-spin" : ""}`} />
            Sync emails
          </Button>
          <Button size="sm" onClick={() => summarize.mutate()} disabled={!emails.data?.length || summarize.isPending}>
            <Sparkles className="h-4 w-4 mr-1" />
            Summarize with AI
          </Button>
        </div>
      </div>

      {!hasGmail && (
        <Card className="p-3 text-sm bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
          Connect your Gmail in <a href="/settings/integrations" className="underline">Settings → Integrations</a> to pull emails into this lead.
        </Card>
      )}

      {summary.data && (
        <Card className="p-4 bg-primary/5 border-primary/20 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Summary
            <span className="text-xs text-muted-foreground font-normal">
              · {format(new Date(summary.data.generated_at), "PPp")}
            </span>
          </div>
          <ul className="text-sm list-disc pl-5 space-y-1">
            {(summary.data.summary_bullets ?? []).map((b: string, i: number) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          <div className="text-sm"><b>Ball in court:</b> {summary.data.ball_in_court}</div>
          <div className="text-sm"><b>Next action:</b> {summary.data.next_action}</div>
        </Card>
      )}

      {threads.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No emails matched yet. Add the customer's email addresses under Contacts, then press Sync.
        </Card>
      ) : (
        <div className="space-y-2">
          {threads.map(({ tid, msgs, last }) => (
            <button
              key={tid}
              onClick={() => setOpenThread(tid)}
              className="w-full text-left border rounded-md p-3 hover:bg-muted/50 transition"
            >
              <div className="flex items-center gap-2 text-sm">
                {last.direction === "inbound" ? (
                  <ArrowDownRight className="h-4 w-4 text-emerald-600" />
                ) : (
                  <ArrowUpRight className="h-4 w-4 text-blue-600" />
                )}
                <span className="font-medium truncate">{last.subject || "(no subject)"}</span>
                <Badge variant="secondary" className="ml-auto shrink-0">{msgs.length} msg</Badge>
                {last.has_attachments && <Paperclip className="h-3 w-3 text-muted-foreground" />}
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center justify-between gap-2">
                <span className="truncate">{last.from_email} · {last.snippet}</span>
                <span className="shrink-0">{format(new Date(last.sent_at), "PP p")}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <Sheet open={!!openThread} onOpenChange={(v) => !v && setOpenThread(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-base">
              {currentThread?.last.subject || "(no subject)"}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {currentThread?.msgs.map((m: any) => (
              <Card key={m.id} className="p-3 text-sm space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {m.direction === "inbound" ? (
                    <Badge variant="secondary" className="gap-1"><ArrowDownRight className="h-3 w-3" />Inbound</Badge>
                  ) : (
                    <Badge className="gap-1"><ArrowUpRight className="h-3 w-3" />Outbound</Badge>
                  )}
                  <span className="font-medium">{m.from_email}</span>
                  <span className="text-muted-foreground text-xs">→ {(m.to_emails ?? []).join(", ")}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{format(new Date(m.sent_at), "PP p")}</span>
                </div>
                <div className="whitespace-pre-wrap text-muted-foreground text-xs">
                  {m.body_preview || m.snippet}
                </div>
                <a
                  href={`https://mail.google.com/mail/u/0/#all/${m.gmail_message_id}`}
                  target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Open in Gmail <ExternalLink className="h-3 w-3" />
                </a>
              </Card>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
