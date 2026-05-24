import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useRouter, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowLeft,
  Check,
  Clock,
  Copy as CopyIcon,
  FileDown,
  History,
  Loader2,
  Printer,
  RefreshCcw,
  Save,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useProposalsStore } from "@/lib/proposals/storage";
import { DocumentPreview } from "@/components/proposals/DocumentPreview";
import { SECTION_LABELS } from "@/lib/proposals/templates";
import type { Proposal, ProposalSection, ProposalStatus } from "@/lib/proposals/types";
import { improveSection } from "@/lib/proposals/improve.functions";
import { statusColor } from "@/lib/proposals/utils";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/proposals/$proposalId")({
  component: ProposalEditorPage,
  notFoundComponent: () => (
    <div className="rounded-lg border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
      Proposal not found. <a className="text-emerald-400 underline" href="/proposals">Back to library</a>
    </div>
  ),
});

function ProposalEditorPage() {
  const { proposalId } = Route.useParams();
  const router = useRouter();
  const { proposals, updateInPlace, upsert } = useProposalsStore();
  const improve = useServerFn(improveSection);

  const original = proposals.find((p) => p.id === proposalId);
  if (!original) throw notFound();

  const [draft, setDraft] = useState<Proposal>(original);
  const [activeId, setActiveId] = useState<string | null>(original.sections[0]?.id ?? null);
  const [lastSaved, setLastSaved] = useState<Date>(new Date(original.updatedAt));
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenInstruction, setRegenInstruction] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const draftRef = useRef(draft);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // auto-save every 30s
  useEffect(() => {
    const t = setInterval(() => {
      const current = draftRef.current;
      const remote = proposals.find((p) => p.id === current.id);
      if (!remote) return;
      if (JSON.stringify(remote) !== JSON.stringify(current)) {
        updateInPlace(current);
        setLastSaved(new Date());
      }
    }, 30000);
    return () => clearInterval(t);
  }, [proposals, updateInPlace]);

  // print mode via query
  const search = router.state.location.search as { print?: number };
  useEffect(() => {
    if (search?.print) {
      setTimeout(() => window.print(), 400);
    }
  }, [search?.print]);

  const active = draft.sections.find((s) => s.id === activeId) ?? draft.sections[0];

  function updateSection(patch: Partial<ProposalSection>) {
    if (!active) return;
    setDraft((d) => ({
      ...d,
      sections: d.sections.map((s) => (s.id === active.id ? { ...s, ...patch, edited: true } : s)),
    }));
  }

  function saveNow(changeNote = "Edited") {
    const saved = upsert(draft, changeNote);
    setDraft(saved);
    setLastSaved(new Date());
    toast.success("Saved");
  }

  function setStatus(status: ProposalStatus) {
    const now = new Date().toISOString();
    const next: Proposal = {
      ...draft,
      status,
      sentAt: status === "sent" ? now : draft.sentAt,
      decidedAt: status === "accepted" || status === "rejected" ? now : draft.decidedAt,
    };
    setDraft(next);
    updateInPlace(next);
    toast.success(`Marked as ${status}`);
  }

  async function runImprove(instruction: string) {
    if (!active) return;
    setAiBusy(true);
    try {
      const res = await improve({
        data: {
          sectionTitle: active.title,
          currentContent: active.content,
          instruction,
          clientCompany: draft.clientCompany,
          clientIndustry: draft.clientIndustry,
          tone: draft.tone,
        },
      });
      updateSection({ title: res.title, content: res.content, aiGenerated: true });
      toast.success(res.changeNote || "Section updated");
      setRegenOpen(false);
      setRegenInstruction("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI failed");
    } finally {
      setAiBusy(false);
    }
  }

  const wordCount = useMemo(() => {
    if (!active) return 0;
    return active.content.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
  }, [active]);

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card/40 p-3 backdrop-blur print:hidden">
        <Button variant="ghost" size="sm" onClick={() => router.navigate({ to: "/proposals" })}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Library
        </Button>
        <Input
          className="max-w-md font-semibold"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        />
        <Badge variant="outline" className={statusColor(draft.status)}>{draft.status}</Badge>
        <Select value={draft.status} onValueChange={(v) => setStatus(v as ProposalStatus)}>
          <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="text-[10px]">v{draft.version}</Badge>
        <Button size="sm" variant="ghost" onClick={() => setShowHistory(true)}>
          <History className="mr-1 h-4 w-4" /> History
        </Button>
        <span className="ml-2 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" /> Saved {format(lastSaved, "HH:mm:ss")}
        </span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => saveNow()}>
            <Save className="mr-1 h-4 w-4" /> Save
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(draft.sections.map((s) => `<h2>${s.title}</h2>\n${s.content}`).join("\n\n"));
              toast.success("HTML copied");
            }}
          >
            <CopyIcon className="mr-1 h-4 w-4" /> Copy HTML
          </Button>
          <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" /> Print / PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        {/* Left: section editor */}
        <div className="space-y-3 print:hidden">
          <Card className="border-border/60 bg-card/40 backdrop-blur">
            <CardContent className="space-y-1 p-2">
              {draft.sections
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveId(s.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-sm",
                      active?.id === s.id
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : "hover:bg-accent",
                    )}
                  >
                    <span className="truncate">{s.title}</span>
                    <span className="flex items-center gap-1">
                      {s.edited && <Badge variant="outline" className="text-[10px]">edited</Badge>}
                      {s.aiGenerated && !s.edited && <Badge variant="outline" className="border-emerald-500/40 text-[10px] text-emerald-400">AI</Badge>}
                    </span>
                  </button>
                ))}
            </CardContent>
          </Card>

          {active && (
            <Card className="border-border/60 bg-card/40 backdrop-blur">
              <CardContent className="space-y-2 p-3">
                <Input
                  value={active.title}
                  onChange={(e) => updateSection({ title: e.target.value })}
                  className="text-sm font-semibold"
                />
                <Textarea
                  className="min-h-[260px] font-mono text-xs"
                  value={active.content}
                  onChange={(e) => updateSection({ content: e.target.value })}
                />
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>HTML content · {wordCount} words</span>
                  <span>{SECTION_LABELS[active.type]}</span>
                </div>

                <div className="flex flex-wrap gap-1 border-t border-border/40 pt-2">
                  {[
                    { label: "More Formal", instr: "Rewrite in a more formal, government-procurement appropriate tone." },
                    { label: "Make Shorter", instr: "Cut length by ~40% while preserving every key fact." },
                    { label: "Strengthen Value Prop", instr: "Sharpen the value proposition, lead with outcomes and quantified benefits." },
                    { label: "Add BD Context", instr: "Add specific Bangladesh market and regulatory context where relevant." },
                  ].map((b) => (
                    <Button
                      key={b.label}
                      size="sm"
                      variant="outline"
                      disabled={aiBusy}
                      onClick={() => runImprove(b.instr)}
                      className="h-7 text-xs"
                    >
                      <Sparkles className="mr-1 h-3 w-3 text-emerald-400" /> {b.label}
                    </Button>
                  ))}
                  <Popover open={regenOpen} onOpenChange={setRegenOpen}>
                    <PopoverTrigger asChild>
                      <Button size="sm" variant="outline" disabled={aiBusy} className="h-7 text-xs">
                        <RefreshCcw className="mr-1 h-3 w-3" /> Regenerate
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[320px]">
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Custom instruction</div>
                        <Textarea
                          rows={3}
                          value={regenInstruction}
                          onChange={(e) => setRegenInstruction(e.target.value)}
                          placeholder="Give specific instruction for regeneration…"
                        />
                        <Button
                          size="sm"
                          className="w-full bg-emerald-500 hover:bg-emerald-600"
                          disabled={aiBusy || !regenInstruction.trim()}
                          onClick={() => runImprove(regenInstruction.trim())}
                        >
                          {aiBusy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                          Regenerate
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => updateSection({ edited: false })}
                    className="ml-auto h-7 text-xs"
                  >
                    <Check className="mr-1 h-3 w-3 text-emerald-400" /> Approve
                  </Button>
                </div>
                {aiBusy && (
                  <div className="flex items-center gap-2 text-xs text-emerald-400">
                    <Loader2 className="h-3 w-3 animate-spin" /> AI working…
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: preview */}
        <div className="overflow-auto rounded-lg bg-slate-200 p-4 print:bg-white print:p-0">
          <DocumentPreview proposal={draft} />
        </div>
      </div>

      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Version history</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {(draft.history ?? []).length === 0 && (
              <div className="text-sm text-muted-foreground">No previous versions yet.</div>
            )}
            {(draft.history ?? []).map((h) => (
              <div key={h.version} className="rounded-md border border-border/60 p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">v{h.version}</span>
                  <span className="text-xs text-muted-foreground">{format(new Date(h.createdAt), "dd MMM HH:mm")}</span>
                </div>
                <div className="text-xs text-muted-foreground">{h.changeNote}</div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => {
                    setDraft((d) => ({ ...d, sections: h.sections }));
                    toast.success(`Restored v${h.version}`);
                    setShowHistory(false);
                  }}
                >
                  Restore
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
