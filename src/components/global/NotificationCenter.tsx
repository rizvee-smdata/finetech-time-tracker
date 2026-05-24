import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Check, CheckCheck, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useNotifications } from "@/lib/app/notifications";
import type { Notification, NotificationCategory } from "@/lib/app/types";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

const CATEGORY_META: Record<NotificationCategory, { dot: string; label: string }> = {
  urgent: { dot: "bg-red-500", label: "🔴 Urgent" },
  today: { dot: "bg-amber-500", label: "🟡 Today" },
  update: { dot: "bg-blue-500", label: "🔵 Updates" },
  win: { dot: "bg-emerald-500", label: "🟢 Wins" },
};

const SOURCE_LABEL: Record<string, string> = {
  meeting: "Meeting",
  deal: "Deal",
  time: "Time",
  proposal: "Proposal",
  system: "System",
};

export function NotificationCenter() {
  const { items, unreadCount, markRead, markAllRead, dismiss, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | NotificationCategory>("all");

  const filtered = useMemo(() => {
    if (tab === "all") return items;
    return items.filter((n) => n.category === tab);
  }, [items, tab]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute right-0 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            <span>Notifications</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={markAllRead} title="Mark all read">
                <CheckCheck className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={clearAll} title="Clear all">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </SheetTitle>
        </SheetHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mt-3">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="urgent">🔴</TabsTrigger>
            <TabsTrigger value="today">🟡</TabsTrigger>
            <TabsTrigger value="update">🔵</TabsTrigger>
            <TabsTrigger value="win">🟢</TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="mt-3">
            <ScrollArea className="h-[calc(100vh-180px)] pr-2">
              {filtered.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
                  Nothing here yet.
                </div>
              ) : (
                <ul className="space-y-2">
                  {filtered.map((n) => (
                    <NotificationItem key={n.id} n={n} onRead={markRead} onDismiss={dismiss} onClose={() => setOpen(false)} />
                  ))}
                </ul>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function NotificationItem({
  n,
  onRead,
  onDismiss,
  onClose,
}: {
  n: Notification;
  onRead: (id: string) => void;
  onDismiss: (id: string) => void;
  onClose: () => void;
}) {
  const meta = CATEGORY_META[n.category];
  const content = (
    <div
      className={cn(
        "rounded-lg border border-border/60 bg-card/40 p-3 backdrop-blur transition-colors hover:bg-accent/40",
        !n.read && "border-l-2",
      )}
      style={!n.read ? { borderLeftColor: "var(--primary)" } : undefined}
    >
      <div className="flex items-start gap-2">
        <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", meta.dot)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{n.title}</span>
            <Badge variant="outline" className="h-4 px-1 text-[9px]">{SOURCE_LABEL[n.source] ?? n.source}</Badge>
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.description}</p>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
            </span>
            <div className="flex items-center gap-1">
              {!n.read && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRead(n.id);
                  }}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                  aria-label="Mark read"
                >
                  <Check className="h-3 w-3" />
                </button>
              )}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDismiss(n.id);
                }}
                className="text-[10px] text-muted-foreground hover:text-foreground"
                aria-label="Dismiss"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (n.link) {
    return (
      <li>
        <Link
          to={n.link.to}
          params={n.link.params as never}
          onClick={() => {
            onRead(n.id);
            onClose();
          }}
        >
          {content}
        </Link>
      </li>
    );
  }
  return <li onClick={() => onRead(n.id)}>{content}</li>;
}
