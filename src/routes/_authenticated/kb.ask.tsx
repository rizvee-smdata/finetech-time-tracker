import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Sparkles, Send, Loader2, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { askKb } from "@/lib/kb";

export const Route = createFileRoute("/_authenticated/kb/ask")({
  component: KbAsk,
});

type Turn = {
  question: string;
  answer: string;
  sources: Array<{ id: string; title: string; oem_name: string | null }>;
};

function KbAsk() {
  const [q, setQ] = useState("");
  const [history, setHistory] = useState<Turn[]>([]);

  const ask = useMutation({
    mutationFn: (question: string) => askKb(question),
    onSuccess: (data, question) => {
      setHistory((h) => [{ question, answer: data.answer, sources: data.sources }, ...h]);
      setQ("");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to get answer"),
  });

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <Link to="/kb" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4 mr-1" /> Knowledge base
      </Link>
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Sparkles className="h-7 w-7 text-primary" /> Ask AI
        </h1>
        <p className="text-muted-foreground">Ask anything about our products — answered from our knowledge base.</p>
      </div>

      <Card className="p-4 space-y-3">
        <Textarea
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask anything about our products… e.g. 'What's the difference between Fortinet FortiGate 40F and 60F?'"
          rows={3}
          className="resize-none"
        />
        <div className="flex justify-end">
          <Button
            onClick={() => q.trim() && ask.mutate(q.trim())}
            disabled={ask.isPending || q.trim().length < 3}
          >
            {ask.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
            Ask
          </Button>
        </div>
      </Card>

      {history.length === 0 && !ask.isPending && (
        <div className="text-sm text-muted-foreground">
          Try: "Battlecard against Palo Alto", "Rubrik pricing tiers", "Adaptiva use cases".
        </div>
      )}

      <div className="space-y-4">
        {history.map((t, i) => (
          <Card key={i} className="p-4 space-y-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1">You asked</div>
              <div className="font-medium">{t.question}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Answer
              </div>
              <div className="whitespace-pre-wrap leading-relaxed">{t.answer}</div>
            </div>
            {t.sources.length > 0 && (
              <div className="pt-2 border-t">
                <div className="text-xs text-muted-foreground mb-2">Sources</div>
                <div className="flex flex-wrap gap-2">
                  {t.sources.map((s) => (
                    <Link key={s.id} to="/kb/article/$id" params={{ id: s.id }}>
                      <Button variant="outline" size="sm">
                        <FileText className="h-3 w-3 mr-1" />
                        {s.title}
                        {s.oem_name && <span className="ml-1 text-muted-foreground">· {s.oem_name}</span>}
                      </Button>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
