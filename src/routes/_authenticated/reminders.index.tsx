import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { CheckCheck, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ALL_CATEGORIES, CATEGORY_META, type NotificationCategory, type Reminder } from "@/lib/notifications/types";
import { PaginationBar, usePagination } from "@/components/PageSizeSelect";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reminders/")({
  component: NotificationsInbox,
});

type Filter = "all" | "unread" | NotificationCategory;

function NotificationsInbox() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");

  const { data: items = [] } = useQuery({
    queryKey: ["reminders-inbox", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("reminders")
        .select("*")
        .eq("user_id", user!.id)
        .is("dismissed_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      return ((data ?? []) as unknown) as Reminder[];
    },
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("notif-inbox")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "reminders", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["reminders-inbox", user.id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);

  const counts = useMemo(() => {
    const m = new Map<Filter, number>();
    m.set("all", items.length);
    m.set("unread", items.filter((i) => !i.read_at).length);
    for (const c of ALL_CATEGORIES) m.set(c, items.filter((i) => i.category === c).length);
    return m;
  }, [items]);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "unread") return items.filter((i) => !i.read_at);
    return items.filter((i) => i.category === filter);
  }, [items, filter]);

  const pg = usePagination(filtered, 20);

  async function markRead(id: string) {
    await supabase.from("reminders").update({ read_at: new Date().toISOString() }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["reminders-inbox", user?.id] });
  }
  async function dismiss(id: string) {
    await supabase.from("reminders")
      .update({ dismissed_at: new Date().toISOString(), read_at: new Date().toISOString() })
      .eq("id", id);
    qc.invalidateQueries({ queryKey: ["reminders-inbox", user?.id] });
  }
  async function markAllRead() {
    if (!user) return;
    await supabase.from("reminders")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    qc.invalidateQueries({ queryKey: ["reminders-inbox", user.id] });
  }

  const tabs: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "unread", label: "Unread" },
    ...ALL_CATEGORIES.map((c) => ({ id: c, label: CATEGORY_META[c].label })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {tabs.map((t) => {
            const n = counts.get(t.id) ?? 0;
            if (t.id !== "all" && t.id !== "unread" && n === 0) return null;
            const active = filter === t.id;
            return (
              <button
                key={t.id}
                onClick={() => { setFilter(t.id); pg.setPage(1); }}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t.label} {n > 0 && <span className="ml-1 opacity-75">{n}</span>}
              </button>
            );
          })}
        </div>
        <Button variant="outline" size="sm" onClick={markAllRead} disabled={(counts.get("unread") ?? 0) === 0}>
          <CheckCheck className="mr-1.5 h-4 w-4" /> Mark all read
        </Button>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            No notifications in this view.
          </Card>
        )}
        {pg.paged.map((n) => {
          const meta = CATEGORY_META[n.category] ?? CATEGORY_META.general;
          const Icon = meta.icon;
          const overdue = !n.read_at && isPast(new Date(n.remind_at));
          return (
            <Card key={n.id} className={cn("p-4", n.read_at && "opacity-70")}>
              <div className="flex items-start gap-3">
                <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", meta.tone)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className={cn("font-medium", !n.read_at && "text-foreground")}>{n.title}</div>
                    <Badge variant="secondary" className="text-[10px]">{meta.label}</Badge>
                    {overdue && <Badge variant="destructive" className="text-[10px]">Overdue</Badge>}
                    {!n.read_at && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </div>
                  {n.body && <div className="mt-1 text-sm text-muted-foreground">{n.body}</div>}
                  <div className="mt-1 text-xs text-muted-foreground">
                    {format(new Date(n.remind_at), "PPpp")} · {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {n.link_url && (
                    <Button asChild size="sm" variant="ghost">
                      <Link to={n.link_url as "/reminders"}>Open</Link>
                    </Button>
                  )}
                  {!n.read_at && (
                    <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>
                      <CheckCheck className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => dismiss(n.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <PaginationBar {...pg} label="notifications" />
    </div>
  );
}
