import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from "recharts";
import { Sparkles, Send, Plus, MessageSquare, Trash2, Calendar, AlertTriangle, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { copilotQuery } from "@/lib/copilot/query.functions";
import {
  appendMessage, createConversation, deleteConversation, listConversations, listMessages,
} from "@/lib/copilot/api";
import { STARTER_QUESTIONS, type CopilotAnswer, type CopilotChart, type CopilotTable } from "@/lib/copilot/types";

export const Route = createFileRoute("/_authenticated/copilot")({
  component: CopilotPage,
});

const PALETTE = ["hsl(var(--primary))", "#10b981", "#f59e0b", "#ef4444", "#6366f1", "#0ea5e9"];

function formatCell(value: unknown, fmt?: string): string {
  if (value == null) return "—";
  if (fmt === "bdt") return "৳" + Number(value).toLocaleString("en-IN");
  if (fmt === "number") return Number(value).toLocaleString("en-IN");
  if (fmt === "percent") return `${value}%`;
  if (fmt === "date" && typeof value === "string") return new Date(value).toLocaleDateString();
  return String(value);
}

function ChartView({ chart }: { chart: CopilotChart }) {
  if (chart.type === "pie") {
    const key = chart.series[0]?.key ?? "value";
    return (
      <div className="h-64 w-full">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={chart.data} dataKey={key} nameKey={chart.x_key} outerRadius={90} label>
              {chart.data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }
  const Comp = chart.type === "line" ? LineChart : BarChart;
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <Comp data={chart.data}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey={chart.x_key} fontSize={11} />
          <YAxis fontSize={11} />
          <Tooltip />
          <Legend />
          {chart.series.map((s, i) =>
            chart.type === "line" ? (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color || PALETTE[i % PALETTE.length]} strokeWidth={2} />
            ) : (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color || PALETTE[i % PALETTE.length]} radius={[4,4,0,0]} />
            ),
          )}
        </Comp>
      </ResponsiveContainer>
    </div>
  );
}

function TableView({ table }: { table: CopilotTable }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      {table.title && <div className="border-b bg-muted/40 px-3 py-2 text-xs font-medium">{table.title}</div>}
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
          <tr>{table.columns.map((c) => <th key={c.key} className="px-3 py-2 text-left font-medium">{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i} className={i % 2 ? "bg-muted/20" : ""}>
              {table.columns.map((c) => (
                <td key={c.key} className="px-3 py-2 tabular-nums">{formatCell(row[c.key], c.format)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnswerBubble({ data }: { data: CopilotAnswer }) {
  return (
    <div className="space-y-3">
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <ReactMarkdown>{data.answer}</ReactMarkdown>
      </div>
      {data.chart && <Card className="p-3"><ChartView chart={data.chart} /></Card>}
      {data.table && <TableView table={data.table} />}
      {data.drill_downs && data.drill_downs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.drill_downs.map((d, i) => (
            <Link key={i} to={d.path as any} className="text-xs text-primary underline-offset-2 hover:underline">
              → {d.label}
            </Link>
          ))}
        </div>
      )}
      {data.citation && <div className="text-xs text-muted-foreground italic">{data.citation}</div>}
    </div>
  );
}

function CopilotPage() {
  const { user, companyId } = useAuth();
  const qc = useQueryClient();
  const askFn = useServerFn(copilotQuery);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: conversations } = useQuery({
    queryKey: ["copilot-convs", user?.id],
    enabled: !!user?.id,
    queryFn: () => listConversations(user!.id),
  });

  const { data: messages } = useQuery({
    queryKey: ["copilot-msgs", activeId],
    enabled: !!activeId,
    queryFn: () => listMessages(activeId!),
  });

  useEffect(() => {
    if (!activeId && conversations && conversations.length > 0) setActiveId(conversations[0].id);
  }, [activeId, conversations]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const handleNew = async () => {
    if (!user || !companyId) return;
    const conv = await createConversation(companyId, user.id);
    await qc.invalidateQueries({ queryKey: ["copilot-convs", user.id] });
    setActiveId(conv.id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this conversation?")) return;
    await deleteConversation(id);
    await qc.invalidateQueries({ queryKey: ["copilot-convs", user?.id] });
    if (activeId === id) setActiveId(null);
  };

  const send = async (question: string) => {
    if (!user || !companyId || !question.trim() || pending) return;
    let convId = activeId;
    if (!convId) {
      const conv = await createConversation(companyId, user.id, question.slice(0, 60));
      convId = conv.id;
      setActiveId(convId);
      await qc.invalidateQueries({ queryKey: ["copilot-convs", user.id] });
    }
    setInput("");
    setPending(true);
    try {
      await appendMessage(convId, "user", question);
      await qc.invalidateQueries({ queryKey: ["copilot-msgs", convId] });

      const history = (messages ?? []).slice(-4).map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      }));

      const answer = await askFn({ data: { company_id: companyId, question, history } });
      await appendMessage(convId, "assistant", answer.answer, answer);
      await qc.invalidateQueries({ queryKey: ["copilot-msgs", convId] });
      await qc.invalidateQueries({ queryKey: ["copilot-convs", user.id] });
    } catch (e: any) {
      toast.error(e?.message ?? "Copilot failed");
    } finally {
      setPending(false);
    }
  };

  const isEmpty = (messages ?? []).length === 0;

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="border-b md:border-b-0 md:border-r md:w-72 flex flex-col">
        <div className="p-3 border-b flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="font-semibold">Manager Copilot</h1>
        </div>
        <div className="p-3 space-y-2">
          <Button onClick={handleNew} className="w-full" size="sm"><Plus className="h-4 w-4 mr-2" />New conversation</Button>
          <div className="flex gap-1">
            <Link to="/copilot/scheduled" className="flex-1"><Button variant="outline" size="sm" className="w-full"><Calendar className="h-3.5 w-3.5 mr-1" />Scheduled</Button></Link>
            <Link to="/copilot/anomalies" className="flex-1"><Button variant="outline" size="sm" className="w-full"><AlertTriangle className="h-3.5 w-3.5 mr-1" />Anomalies</Button></Link>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {(conversations ?? []).map((c) => (
              <div key={c.id} className={cn("group flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted",
                activeId === c.id && "bg-muted")} onClick={() => setActiveId(c.id)}>
                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-sm">{c.title}</span>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </aside>

      {/* Conversation */}
      <main className="flex-1 flex flex-col min-h-0">
        <ScrollArea className="flex-1" ref={scrollRef as any}>
          <div className="mx-auto max-w-3xl w-full p-4 space-y-5">
            {isEmpty && (
              <div className="space-y-4 pt-8">
                <div className="text-center space-y-1">
                  <Sparkles className="h-8 w-8 text-primary mx-auto" />
                  <h2 className="text-lg font-semibold">Ask anything about your sales data</h2>
                  <p className="text-sm text-muted-foreground">Pipeline, rep performance, client risk, expenses, visits.</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {STARTER_QUESTIONS.map((q) => (
                    <button key={q} onClick={() => send(q)} disabled={pending}
                      className="text-left text-sm rounded-lg border bg-card p-3 hover:bg-muted transition disabled:opacity-50">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {(messages ?? []).map((m) => (
              <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[90%] rounded-lg",
                  m.role === "user" ? "bg-primary text-primary-foreground px-3 py-2" : "")}>
                  {m.role === "user"
                    ? <div className="text-sm whitespace-pre-wrap">{m.content}</div>
                    : <AnswerBubble data={m.data ?? { answer: m.content, citation: "" }} />}
                </div>
              </div>
            ))}
            {pending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t p-3">
          <div className="mx-auto max-w-3xl flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask about pipeline, reps, clients, expenses…"
              rows={2}
              className="resize-none"
              disabled={pending}
            />
            <Button onClick={() => send(input)} disabled={pending || !input.trim()} size="icon">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <div className="mx-auto max-w-3xl mt-1">
            <Badge variant="outline" className="text-[10px]">AI may produce mistakes — verify before acting</Badge>
          </div>
        </div>
      </main>
    </div>
  );
}
