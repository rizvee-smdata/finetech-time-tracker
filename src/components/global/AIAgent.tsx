import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Loader2, Check, Undo2, ArrowUpRight } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAI } from "@/lib/ai/context";
import { runAgent } from "@/lib/ai/agent.functions";
import { applyAgentAction, buildDataSnapshot, type AgentAction, type AppliedAction } from "@/lib/ai/apply";

type Msg = { role: "user" | "assistant"; content: string; applied?: AppliedAction[] };

export function AIAgentTrigger() {
  const { setOpen } = useAI();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 text-violet-300 hover:text-violet-200"
      onClick={() => setOpen(true)}
      title="Open DeskIQ Copilot (⌘J)"
    >
      <Sparkles className="h-4 w-4" />
      <span className="hidden sm:inline">Copilot</span>
    </Button>
  );
}

export function AIAgent() {
  const { open, setOpen, context, consumeInitialPrompt } = useAI();
  const run = useServerFn(runAgent);
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      const seeded = consumeInitialPrompt();
      if (seeded) {
        setInput(seeded);
      }
    }
  }, [open, consumeInitialPrompt]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const result = await run({
        data: {
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
          routeContext: context,
          dataSnapshot: buildDataSnapshot(),
        },
      });
      const actions = (JSON.parse(result.actionsJson || "[]") as AgentAction[]) ?? [];
      const applied: AppliedAction[] = actions.map((a) => applyAgentAction(a));
      setMessages((m) => [...m, { role: "assistant", content: result.reply, applied }]);

      // Side effects
      for (const a of applied) {
        if (a.applied && a.payload?.subject) {
          try {
            await navigator.clipboard.writeText(`${a.payload.subject}\n\n${a.payload.body}`);
            toast.success("Email draft copied to clipboard");
          } catch {
            /* ignore */
          }
        }
      }
      const nav = applied.find((a) => a.applied && a.navigateTo);
      if (nav?.navigateTo) {
        toast.success(`Opening ${nav.navigateTo}`);
        navigate({ to: nav.navigateTo });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI failed";
      toast.error(msg);
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }

  const suggestions = [
    "What should I focus on today?",
    "Which deals are stalling?",
    "Coach me on the top deal here",
    "Draft a follow-up email for the most stalled deal",
  ];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border/60 p-4">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-400" />
            DeskIQ Copilot
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            Context: <span className="text-foreground/80">{context.summary}</span>
          </p>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Ask anything about your pipeline, deals, time, or proposals. I can also take actions on your behalf.
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs text-violet-200 hover:bg-violet-500/20"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              <div
                className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-primary/15 text-foreground"
                    : "bg-card/60 border border-border/60"
                }`}
              >
                {m.role === "assistant" ? (
                  <div className="prose prose-sm prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">{m.content}</div>
                )}
                {m.applied && m.applied.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
                    {m.applied.map((a, j) => (
                      <div key={j} className="flex items-center justify-between gap-2 rounded bg-background/40 px-2 py-1 text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {a.applied ? <Check className="h-3 w-3 text-emerald-400 shrink-0" /> : <span className="text-amber-400 shrink-0">·</span>}
                          <span className="truncate">{a.label}</span>
                        </div>
                        {a.applied && a.undo && (
                          <button
                            onClick={() => {
                              a.undo?.();
                              toast.success("Undone");
                            }}
                            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                          >
                            <Undo2 className="h-3 w-3" /> Undo
                          </button>
                        )}
                        {a.navigateTo && (
                          <button
                            onClick={() => navigate({ to: a.navigateTo! })}
                            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                          >
                            <ArrowUpRight className="h-3 w-3" /> Open
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
            </div>
          )}
        </div>

        <div className="border-t border-border/60 p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask, plan, or instruct…"
              rows={2}
              className="resize-none text-sm"
            />
            <Button
              size="icon"
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              className="bg-violet-600 hover:bg-violet-500"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            ⌘J to toggle · Enter to send · Shift+Enter newline
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
