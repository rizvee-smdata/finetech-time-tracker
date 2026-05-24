import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMeetingsStore } from "@/lib/meetings/storage";
import { analyzeMeeting } from "@/lib/meetings/analyze.functions";
import { ResultsView } from "@/components/meetings/ResultsView";
import { Eye, RefreshCw, Search, Trash2, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/meetings/history")({
  component: HistoryPage,
});

const sentimentEmoji = { positive: "🟢", neutral: "🟡", negative: "🔴" } as const;

function HistoryPage() {
  const { meetings, setProcessed, deleteMeeting } = useMeetingsStore();
  const analyze = useServerFn(analyzeMeeting);
  const [q, setQ] = useState("");
  const [sentiment, setSentiment] = useState<string>("all");
  const [stage, setStage] = useState<string>("all");
  const [sort, setSort] = useState<"newest" | "oldest" | "pending">("newest");
  const [openId, setOpenId] = useState<string | null>(null);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = meetings.filter((m) => {
      if (q) {
        const blob = `${m.clientName} ${m.clientCompany} ${m.title} ${m.rawNotes}`.toLowerCase();
        if (!blob.includes(q.toLowerCase())) return false;
      }
      if (sentiment !== "all" && m.processed?.sentimentScore !== sentiment) return false;
      if (stage !== "all" && m.processed?.dealStage !== stage) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "newest") return +new Date(b.date) - +new Date(a.date);
      if (sort === "oldest") return +new Date(a.date) - +new Date(b.date);
      const ap = a.processed?.actionItems.filter((i) => !i.done).length ?? 0;
      const bp = b.processed?.actionItems.filter((i) => !i.done).length ?? 0;
      return bp - ap;
    });
    return list;
  }, [meetings, q, sentiment, stage, sort]);

  const opened = openId ? meetings.find((m) => m.id === openId) : null;

  if (opened && opened.processed) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setOpenId(null)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to history
        </Button>
        <ResultsView meeting={opened} />
      </div>
    );
  }

  const handleReprocess = async (id: string) => {
    const m = meetings.find((x) => x.id === id);
    if (!m) return;
    setReprocessingId(id);
    try {
      const result = await analyze({
        data: {
          title: m.title,
          clientName: m.clientName,
          clientCompany: m.clientCompany,
          date: m.date,
          attendees: m.attendees,
          rawNotes: m.rawNotes,
        },
      });
      setProcessed(id, {
        ...result,
        actionItems: result.actionItems.map((a) => ({ ...a, id: "", done: false })),
        crmUpdates: result.crmUpdates.map((c) => ({ ...c, accepted: false })),
      });
      toast.success("Reprocessed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setReprocessingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search client, company, or notes…"
            className="pl-9"
          />
        </div>
        <Select value={sentiment} onValueChange={setSentiment}>
          <SelectTrigger className="w-full md:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sentiment</SelectItem>
            <SelectItem value="positive">🟢 Positive</SelectItem>
            <SelectItem value="neutral">🟡 Neutral</SelectItem>
            <SelectItem value="negative">🔴 Negative</SelectItem>
          </SelectContent>
        </Select>
        <Select value={stage} onValueChange={setStage}>
          <SelectTrigger className="w-full md:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {["Prospecting", "Discovery", "Proposal", "Negotiation", "Closed Won", "Closed Lost"].map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="w-full md:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="pending">Most pending actions</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 && (
        <Card className="bg-card/40 backdrop-blur">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No meetings yet.{" "}
            <Link to="/meetings" className="text-amber-500 hover:underline">
              Create your first one →
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {filtered.map((m) => {
          const p = m.processed;
          const done = p?.actionItems.filter((i) => i.done).length ?? 0;
          const total = p?.actionItems.length ?? 0;
          return (
            <Card key={m.id} className="border-border/60 bg-card/60 backdrop-blur transition-colors hover:border-amber-500/40">
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-semibold">{m.clientName}</div>
                      <span className="text-sm text-muted-foreground">· {m.clientCompany}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {new Date(m.date).toLocaleString()}
                      </span>
                      {p && (
                        <Badge variant="outline" className="text-xs">
                          {sentimentEmoji[p.sentimentScore]} {p.sentimentScore}
                        </Badge>
                      )}
                      {p && <Badge variant="secondary" className="text-xs">{p.dealStage}</Badge>}
                    </div>
                    <div className="text-sm font-medium">{m.title}</div>
                    {p && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">{p.summary}</p>
                    )}
                    {p && (
                      <div className="text-xs text-muted-foreground">
                        Action items: <span className="font-medium text-foreground">{done}/{total}</span> done
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button size="sm" variant="default" onClick={() => setOpenId(m.id)}>
                      <Eye className="mr-1 h-4 w-4" /> View
                    </Button>
                    <Button size="sm" variant="outline" disabled={reprocessingId === m.id} onClick={() => handleReprocess(m.id)}>
                      <RefreshCw className={`mr-1 h-4 w-4 ${reprocessingId === m.id ? "animate-spin" : ""}`} /> Re-process
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this meeting?")) deleteMeeting(m.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
