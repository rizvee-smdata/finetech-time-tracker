import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { aiChat } from "@/lib/ai-chat.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ai")({
  component: AIPage,
});

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Which customers did I visit in the last 30 days?",
  "Top 5 employees by visit count this month",
  "Employees with the least visits in last 60 days",
  "Top 10 visited customers this year",
  "Show partners ranked by related visits",
  "Summary stats for the last 7 days",
];

function AIPage() {
  const ask = useServerFn(aiChat);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const mutation = useMutation({
    mutationFn: async (next: Msg[]) => ask({ data: { messages: next } }),
    onSuccess: (res) => {
      setMessages((m) => [...m, { role: "assistant", content: res.text || "(no response)" }]);
    },
    onError: (err: Error) => {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Error: ${err.message}` },
      ]);
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, mutation.isPending]);

  useEffect(() => {
    taRef.current?.focus();
  }, [mutation.isPending]);

  function send(text: string) {
    const t = text.trim();
    if (!t || mutation.isPending) return;
    const next: Msg[] = [...messages, { role: "user", content: t }];
    setMessages(next);
    setInput("");
    mutation.mutate(next);
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-6rem)] max-w-3xl flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Ask AI</h1>
            <p className="text-xs text-muted-foreground">
              Natural-language insights about visits, employees, customers & partners
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setMessages([])}>
            <RotateCcw className="mr-1 h-4 w-4" /> New chat
          </Button>
        )}
      </div>

      <Card className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Try one of these:</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-lg border border-border bg-card px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                {m.content}
              </div>
            </div>
          ))}

          {mutation.isPending && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-border bg-card/50 p-3">
          <div className="flex items-end gap-2">
            <Textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask about visits, employees, customers…"
              rows={2}
              className="min-h-[44px] resize-none"
              disabled={mutation.isPending}
            />
            <Button onClick={() => send(input)} disabled={!input.trim() || mutation.isPending}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
