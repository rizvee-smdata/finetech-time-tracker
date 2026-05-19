import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { PriorityBadge } from "@/components/tms/PriorityBadge";

/**
 * Cmd+K palette. Operators: status:done | priority:high | assignee:<name> | due:overdue|today|week
 */
export function TaskCommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { companyId } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tokens = q.trim().split(/\s+/).filter(Boolean);
  const ops: Record<string, string> = {};
  const plain: string[] = [];
  for (const t of tokens) {
    const m = t.match(/^(status|priority|assignee|due):(.+)$/i);
    if (m) ops[m[1].toLowerCase()] = m[2].toLowerCase();
    else plain.push(t);
  }
  const text = plain.join(" ");

  const results = useQuery({
    queryKey: ["tms-cmdk", companyId, q],
    enabled: open && !!companyId && q.trim().length >= 1,
    queryFn: async () => {
      let query = supabase
        .from("tms_tasks")
        .select("id, title, priority, due_date, tms_task_statuses(name, is_terminal), tms_task_assignees(profiles:user_id(full_name))")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .limit(20);
      if (text) query = query.ilike("title", `%${text}%`);
      if (ops.priority) query = query.eq("priority", ops.priority as "low");
      if (ops.due === "overdue") query = query.lt("due_date", new Date().toISOString().slice(0, 10));
      if (ops.due === "today") query = query.eq("due_date", new Date().toISOString().slice(0, 10));
      if (ops.due === "week") {
        const w = new Date();
        w.setDate(w.getDate() + 7);
        query = query.gte("due_date", new Date().toISOString().slice(0, 10)).lte("due_date", w.toISOString().slice(0, 10));
      }
      const { data } = await query;
      let rows = (data ?? []) as Array<{
        id: string;
        title: string;
        priority: "low" | "medium" | "high" | "critical";
        due_date: string | null;
        tms_task_statuses: { name: string; is_terminal: boolean } | null;
        tms_task_assignees: Array<{ profiles: { full_name: string | null } | null }>;
      }>;
      if (ops.status) rows = rows.filter((r) => r.tms_task_statuses?.name.toLowerCase().includes(ops.status));
      if (ops.assignee) {
        rows = rows.filter((r) =>
          r.tms_task_assignees.some((a) => (a.profiles?.full_name ?? "").toLowerCase().includes(ops.assignee)),
        );
      }
      return rows;
    },
  });

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        value={q}
        onValueChange={setQ}
        placeholder="Search tasks… try status:done, priority:high, assignee:alex, due:overdue"
      />
      <CommandList>
        <CommandEmpty>{q.trim().length < 1 ? "Type to search…" : "No matches."}</CommandEmpty>
        {(results.data ?? []).length > 0 && (
          <CommandGroup heading="Tasks">
            {(results.data ?? []).map((t) => (
              <CommandItem
                key={t.id}
                value={t.id + " " + t.title}
                onSelect={() => {
                  setOpen(false);
                  navigate({ to: "/tasks/$taskId", params: { taskId: t.id } });
                }}
              >
                <div className="flex items-center justify-between w-full gap-3">
                  <div className="truncate">
                    <div className="text-sm font-medium truncate">{t.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.tms_task_statuses?.name ?? "—"} {t.due_date ? "• due " + t.due_date : ""}
                    </div>
                  </div>
                  <PriorityBadge priority={t.priority} />
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
