import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useMeetingsStore } from "@/lib/meetings/storage";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/meetings/actions")({
  component: ActionsPage,
});

type Row = {
  meetingId: string;
  meetingTitle: string;
  client: string;
  itemId: string;
  task: string;
  owner: string;
  deadline: string;
  priority: "high" | "medium" | "low";
  done: boolean;
};

const priorityColor = {
  high: "text-red-400 border-red-500/40 bg-red-500/10",
  medium: "text-amber-400 border-amber-500/40 bg-amber-500/10",
  low: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
};

function isOverdue(deadline: string): boolean {
  const d = new Date(deadline);
  if (isNaN(+d)) return false;
  return d.getTime() < Date.now();
}
function isDueToday(deadline: string): boolean {
  const d = new Date(deadline);
  if (isNaN(+d)) return false;
  const today = new Date();
  return d.toDateString() === today.toDateString();
}
function isDueThisWeek(deadline: string): boolean {
  const d = new Date(deadline);
  if (isNaN(+d)) return false;
  const now = Date.now();
  return d.getTime() >= now && d.getTime() <= now + 7 * 86400000;
}

function ActionsPage() {
  const { meetings, toggleActionItem } = useMeetingsStore();
  const [group, setGroup] = useState<"meeting" | "priority" | "owner" | "deadline">("priority");
  const [filter, setFilter] = useState<"all" | "mine" | "overdue" | "today" | "week">("all");

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const m of meetings) {
      if (!m.processed) continue;
      for (const a of m.processed.actionItems) {
        out.push({
          meetingId: m.id,
          meetingTitle: m.title,
          client: `${m.clientName} · ${m.clientCompany}`,
          itemId: a.id,
          task: a.task,
          owner: a.owner,
          deadline: a.deadline,
          priority: a.priority,
          done: a.done,
        });
      }
    }
    return out;
  }, [meetings]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === "mine") return r.owner.toLowerCase() === "me";
      if (filter === "overdue") return !r.done && isOverdue(r.deadline);
      if (filter === "today") return !r.done && isDueToday(r.deadline);
      if (filter === "week") return !r.done && isDueThisWeek(r.deadline);
      return true;
    });
  }, [rows, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of filtered) {
      const key =
        group === "meeting" ? `${r.client} — ${r.meetingTitle}` :
        group === "priority" ? r.priority.toUpperCase() :
        group === "owner" ? r.owner :
        r.deadline;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries());
  }, [filtered, group]);

  const total = rows.length;
  const done = rows.filter((r) => r.done).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  const exportCsv = () => {
    const headers = ["Task", "Owner", "Deadline", "Priority", "Done", "Meeting", "Client"];
    const csv = [headers.join(",")]
      .concat(
        rows.map((r) =>
          [r.task, r.owner, r.deadline, r.priority, r.done, r.meetingTitle, r.client]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(","),
        ),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deskiq-action-items-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card className="border-amber-500/30 bg-card/60 backdrop-blur">
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Overall completion</span>
            <span className="font-mono text-muted-foreground">{done}/{total} done · {pct}%</span>
          </div>
          <Progress value={pct} className="h-2" />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-full md:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="mine">My tasks (Me)</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="today">Due today</SelectItem>
            <SelectItem value="week">Due this week</SelectItem>
          </SelectContent>
        </Select>
        <Select value={group} onValueChange={(v) => setGroup(v as typeof group)}>
          <SelectTrigger className="w-full md:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="priority">Group: Priority</SelectItem>
            <SelectItem value="meeting">Group: Meeting</SelectItem>
            <SelectItem value="owner">Group: Owner</SelectItem>
            <SelectItem value="deadline">Group: Deadline</SelectItem>
          </SelectContent>
        </Select>
        <div className="md:ml-auto">
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-1 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {grouped.length === 0 && (
        <Card className="bg-card/40"><CardContent className="p-8 text-center text-sm text-muted-foreground">No action items match.</CardContent></Card>
      )}

      <div className="space-y-4">
        {grouped.map(([key, items]) => (
          <Card key={key} className="border-border/60 bg-card/60 backdrop-blur">
            <CardContent className="space-y-2 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm">
                <span className="font-semibold">{key}</span>
                <Badge variant="secondary" className="text-xs">{items.length}</Badge>
              </div>
              <div className="space-y-1">
                {items.map((r) => {
                  const overdue = !r.done && isOverdue(r.deadline);
                  return (
                    <div
                      key={r.meetingId + r.itemId}
                      className={cn(
                        "flex items-start gap-3 rounded-md border border-transparent p-2 transition-colors hover:bg-accent/30",
                        overdue && "border-l-4 border-l-red-500",
                      )}
                    >
                      <Checkbox
                        checked={r.done}
                        onCheckedChange={() => toggleActionItem(r.meetingId, r.itemId)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className={cn("text-sm", r.done && "text-muted-foreground line-through")}>
                          {r.task}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>👤 {r.owner}</span>
                          <span className="font-mono">📅 {r.deadline}</span>
                          <span className="truncate">📝 {r.meetingTitle}</span>
                        </div>
                      </div>
                      <Badge variant="outline" className={cn("shrink-0 text-xs", priorityColor[r.priority])}>
                        {r.priority}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
