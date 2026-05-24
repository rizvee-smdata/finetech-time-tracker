import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Clock, Mic, TrendingUp, CheckCheck, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { TimeEntry } from "@/lib/time/types";
import type { Deal } from "@/lib/deals/types";
import type { Meeting } from "@/lib/meetings/types";

type Event = { id: string; kind: "time" | "meeting" | "stage" | "action" | "health"; date: string; text: string; link: string; icon: typeof Clock; color: string };

export function ActivityFeed({ entries, deals, meetings }: { entries: TimeEntry[]; deals: Deal[]; meetings: Meeting[] }) {
  const events = useMemo<Event[]>(() => {
    const list: Event[] = [];
    for (const e of entries.slice(0, 15)) {
      list.push({ id: `te-${e.id}`, kind: "time", date: e.startTime, text: `Logged ${(e.duration / 60).toFixed(1)}h — ${e.description}`, link: "/time", icon: Clock, color: "text-violet-400" });
    }
    for (const m of meetings.slice(0, 10)) {
      list.push({ id: `m-${m.id}`, kind: "meeting", date: m.createdAt, text: `Meeting processed: ${m.title}`, link: "/meetings/history", icon: Mic, color: "text-amber-400" });
    }
    for (const d of deals) {
      for (const a of d.nextBestActions ?? []) {
        if (a.completed && a.completedAt) {
          list.push({ id: `act-${a.id}`, kind: "action", date: a.completedAt, text: `Completed: ${a.action} (${d.clientCompany})`, link: `/deals/${d.id}`, icon: CheckCheck, color: "text-emerald-400" });
        }
      }
      if (d.healthScore && d.healthScore.status === "stalling") {
        list.push({ id: `h-${d.id}`, kind: "health", date: d.healthScore.lastCalculated, text: `${d.clientCompany} health dropped to ${d.healthScore.score}`, link: `/deals/${d.id}`, icon: AlertTriangle, color: "text-red-400" });
      }
    }
    return list.sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 20);
  }, [entries, deals, meetings]);

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-violet-400" />
        <h3 className="text-sm font-semibold">Recent activity across all modules</h3>
      </div>
      <ul className="space-y-2">
        {events.map((e) => {
          const I = e.icon;
          return (
            <li key={e.id}>
              <Link to={e.link as "/time"} className="flex items-center gap-3 rounded px-2 py-1.5 hover:bg-accent/40">
                <I className={`h-4 w-4 shrink-0 ${e.color}`} />
                <span className="flex-1 truncate text-sm">{e.text}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDistanceToNow(new Date(e.date), { addSuffix: true })}</span>
              </Link>
            </li>
          );
        })}
        {events.length === 0 && <li className="text-sm text-muted-foreground text-center py-4">No activity yet.</li>}
      </ul>
    </div>
  );
}
