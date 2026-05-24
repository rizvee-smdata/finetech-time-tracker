import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_META, type Reminder } from "@/lib/notifications/types";
import { cn } from "@/lib/utils";

export function NotificationBell({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: items = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("reminders")
        .select("*")
        .eq("user_id", user!.id)
        .is("dismissed_at", null)
        .order("created_at", { ascending: false })
        .limit(20);
      return ((data ?? []) as unknown) as Reminder[];
    },
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("notifications-bell")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reminders", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["notifications", user.id] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);

  const unread = items.filter((i) => !i.read_at);
  const unreadCount = unread.length;

  async function markAllRead() {
    if (!user || unreadCount === 0) return;
    await supabase.from("reminders")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    qc.invalidateQueries({ queryKey: ["notifications", user.id] });
  }

  async function dismiss(id: string) {
    await supabase.from("reminders")
      .update({ dismissed_at: new Date().toISOString(), read_at: new Date().toISOString() })
      .eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
  }

  async function open(id: string) {
    await supabase.from("reminders").update({ read_at: new Date().toISOString() }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size={compact ? "icon" : "sm"} className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b p-3">
          <div className="font-medium text-sm">Notifications</div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead} disabled={unreadCount === 0}>
              <CheckCheck className="mr-1 h-3.5 w-3.5" /> Mark all read
            </Button>
          </div>
        </div>
        <ScrollArea className="max-h-[420px]">
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              You're all caught up.
            </div>
          ) : (
            <div className="divide-y">
              {items.map((n) => {
                const meta = CATEGORY_META[n.category] ?? CATEGORY_META.general;
                const Icon = meta.icon;
                const inner = (
                  <div className="flex items-start gap-3 p-3">
                    <div className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full", meta.tone)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <div className={cn("flex-1 text-sm leading-snug", !n.read_at && "font-semibold")}>
                          {n.title}
                        </div>
                        {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                      </div>
                      {n.body && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</div>}
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); dismiss(n.id); }}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
                return n.link_url ? (
                  <Link
                    key={n.id}
                    to={n.link_url as "/reminders"}
                    onClick={() => open(n.id)}
                    className="block hover:bg-accent/50"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div key={n.id} className="hover:bg-accent/50" onClick={() => open(n.id)}>
                    {inner}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
        <div className="border-t p-2">
          <Button asChild variant="ghost" size="sm" className="w-full justify-center">
            <Link to="/reminders">View all <Badge variant="secondary" className="ml-2">{items.length}</Badge></Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
