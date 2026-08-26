import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import {
  addDays,
  differenceInCalendarDays,
  format,
  isSameDay,
  max as maxDate,
  min as minDate,
  startOfDay,
} from "date-fns";
import type { TaskWithRels } from "@/lib/tms/types";

type Bar = { task: TaskWithRels; start: Date; end: Date };
type Group = { key: string; name: string; color: string; bars: Bar[] };

const DAY_W = 30;

function toBar(t: TaskWithRels): Bar | null {
  const endRaw = t.due_date ?? (t as any).start_date;
  const startRaw = (t as any).start_date ?? t.due_date;
  if (!endRaw && !startRaw) return null;
  let start = startOfDay(new Date(startRaw));
  let end = startOfDay(new Date(endRaw));
  if (end < start) [start, end] = [end, start];
  return { task: t, start, end };
}

export function GanttChart({
  tasks,
  groupByProject = true,
}: {
  tasks: TaskWithRels[];
  groupByProject?: boolean;
}) {
  const groups = useMemo<Group[]>(() => {
    const bars = tasks.map(toBar).filter(Boolean) as Bar[];
    if (!groupByProject) {
      return bars.length ? [{ key: "all", name: "Tasks", color: "#6366f1", bars }] : [];
    }
    const map = new Map<string, Group>();
    for (const b of bars) {
      const p = b.task.tms_projects;
      const key = p?.id ?? "none";
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: p?.name ?? "No project",
          color: p?.color ?? "#6366f1",
          bars: [],
        });
      }
      map.get(key)!.bars.push(b);
    }
    return [...map.values()]
      .map((g) => ({ ...g, bars: g.bars.sort((a, b) => a.start.getTime() - b.start.getTime()) }))
      .sort((a, b) => (a.key === "none" ? 1 : b.key === "none" ? -1 : a.name.localeCompare(b.name)));
  }, [tasks, groupByProject]);

  const range = useMemo(() => {
    const all = groups.flatMap((g) => g.bars);
    if (all.length === 0) return null;
    const start = startOfDay(minDate(all.map((r) => r.start)));
    const end = startOfDay(maxDate(all.map((r) => r.end)));
    const days = Math.max(differenceInCalendarDays(end, start) + 1, 14);
    return { start, days };
  }, [groups]);

  if (!range) {
    return (
      <Card className="p-6 text-sm text-muted-foreground text-center">
        No tasks with start or due dates to display.
      </Card>
    );
  }

  const today = startOfDay(new Date());
  const gridW = range.days * DAY_W;

  return (
    <Card className="overflow-x-auto">
      <div className="min-w-max">
        {/* Header */}
        <div className="flex border-b sticky top-0 bg-background z-10">
          <div className="w-56 shrink-0 px-3 py-2 text-xs font-medium text-muted-foreground border-r sticky left-0 bg-background">
            Project / Task
          </div>
          <div className="flex" style={{ width: gridW }}>
            {Array.from({ length: range.days }, (_, i) => {
              const d = addDays(range.start, i);
              const weekend = d.getDay() === 5 || d.getDay() === 6;
              return (
                <div
                  key={i}
                  className={`text-[10px] text-center py-1 border-l ${weekend ? "bg-muted/40" : ""} ${
                    isSameDay(d, today) ? "text-primary font-semibold" : "text-muted-foreground"
                  }`}
                  style={{ width: DAY_W }}
                >
                  <div>{format(d, "d")}</div>
                  {(i === 0 || d.getDate() === 1) && <div className="font-medium">{format(d, "MMM")}</div>}
                </div>
              );
            })}
          </div>
        </div>

        {groups.map((g) => {
          const gStart = minDate(g.bars.map((b) => b.start));
          const gEnd = maxDate(g.bars.map((b) => b.end));
          const gOffset = differenceInCalendarDays(gStart, range.start);
          const gSpan = differenceInCalendarDays(gEnd, gStart) + 1;
          return (
            <div key={g.key}>
              {/* Project summary row */}
              <div className="flex border-b bg-muted/30">
                <div className="w-56 shrink-0 px-3 py-2 border-r sticky left-0 bg-muted/30 flex items-center gap-2">
                  <span className="size-2.5 rounded-sm shrink-0" style={{ background: g.color }} />
                  {g.key !== "none" ? (
                    <Link
                      to="/tasks/projects/$projectId"
                      params={{ projectId: g.key }}
                      className="text-sm font-semibold truncate hover:text-primary"
                    >
                      {g.name}
                    </Link>
                  ) : (
                    <span className="text-sm font-semibold truncate">{g.name}</span>
                  )}
                  <span className="text-[10px] text-muted-foreground ml-auto">{g.bars.length}</span>
                </div>
                <div className="relative" style={{ width: gridW, height: 34 }}>
                  <div
                    className="absolute top-3 h-2 rounded-full opacity-70"
                    style={{ left: gOffset * DAY_W, width: gSpan * DAY_W, background: g.color }}
                  />
                </div>
              </div>

              {/* Task rows */}
              {g.bars.map(({ task, start, end }) => {
                const offset = differenceInCalendarDays(start, range.start);
                const span = differenceInCalendarDays(end, start) + 1;
                const done = task.tms_task_statuses?.is_terminal;
                return (
                  <div key={task.id} className="flex border-b hover:bg-muted/20">
                    <div className="w-56 shrink-0 px-3 py-2 border-r sticky left-0 bg-background">
                      <Link
                        to="/tasks/$taskId"
                        params={{ taskId: task.id }}
                        className={`text-sm truncate block hover:text-primary ${done ? "line-through text-muted-foreground" : ""}`}
                      >
                        {task.title}
                      </Link>
                    </div>
                    <div className="relative" style={{ width: gridW, height: 38 }}>
                      {Array.from({ length: range.days }, (_, i) => {
                        const d = addDays(range.start, i);
                        const weekend = d.getDay() === 5 || d.getDay() === 6;
                        return (
                          <div
                            key={i}
                            className={`absolute top-0 bottom-0 border-l ${weekend ? "bg-muted/30" : ""}`}
                            style={{ left: i * DAY_W, width: DAY_W }}
                          />
                        );
                      })}
                      <div
                        className="absolute top-2 bottom-2 rounded px-2 flex items-center text-[10px] text-white overflow-hidden whitespace-nowrap"
                        style={{
                          left: offset * DAY_W + 2,
                          width: span * DAY_W - 4,
                          background: task.tms_task_statuses?.color ?? g.color,
                          opacity: done ? 0.5 : 1,
                        }}
                        title={`${task.title} · ${format(start, "MMM d")} → ${format(end, "MMM d")}`}
                      >
                        {task.title}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
