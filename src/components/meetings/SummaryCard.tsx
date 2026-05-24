import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Meeting } from "@/lib/meetings/types";

const sentimentMap = {
  positive: { emoji: "🟢", label: "Positive", cls: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10" },
  neutral: { emoji: "🟡", label: "Neutral", cls: "text-amber-400 border-amber-500/40 bg-amber-500/10" },
  negative: { emoji: "🔴", label: "Negative", cls: "text-red-400 border-red-500/40 bg-red-500/10" },
};

export function SummaryCard({ meeting }: { meeting: Meeting }) {
  const p = meeting.processed!;
  const s = sentimentMap[p.sentimentScore];
  return (
    <Card className="border-l-4 border-l-amber-500 border-border/60 bg-card/60 backdrop-blur">
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={s.cls}>{s.emoji} {s.label}</Badge>
          <Badge className="bg-blue-500/20 text-blue-400 hover:bg-blue-500/30">{p.dealStage}</Badge>
          <span className="font-mono text-xs text-muted-foreground">
            {new Date(meeting.date).toLocaleString()}
          </span>
        </div>
        <h2 className="text-lg font-semibold">{meeting.title}</h2>
        <p className="text-sm leading-relaxed text-foreground/90">{p.summary}</p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Badge variant="secondary" className="text-xs">👤 {meeting.clientName}</Badge>
          <Badge variant="secondary" className="text-xs">🏢 {meeting.clientCompany}</Badge>
          {meeting.attendees.map((a) => (
            <Badge key={a} variant="outline" className="text-xs">{a}</Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
