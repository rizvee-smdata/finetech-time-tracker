import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDealsStore } from "@/lib/deals/storage";
import { useTimeStore } from "@/lib/time/storage";
import { deriveAlerts } from "@/lib/alerts/derive";

export function AlertsBell() {
  const { deals } = useDealsStore();
  const { entries, budgets, timer } = useTimeStore();
  const alerts = useMemo(() => deriveAlerts(deals, entries, budgets, timer), [deals, entries, budgets, timer]);
  const count = alerts.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4 text-violet-400" />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-violet-500 px-1 text-[10px] font-semibold text-white">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        <div className="border-b p-3 text-sm font-medium">Smart alerts</div>
        <ScrollArea className="max-h-[420px]">
          {alerts.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">All clear.</div>
          ) : (
            <ul className="divide-y">
              {alerts.map((a) => {
                const tone = a.severity === "critical" ? "bg-red-500/15 text-red-400" : a.severity === "warning" ? "bg-amber-500/15 text-amber-400" : "bg-blue-500/15 text-blue-400";
                return (
                  <li key={a.id} className="p-3">
                    <div className="flex items-start gap-2">
                      <div className={`h-2 w-2 mt-1.5 rounded-full ${tone}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{a.title}</div>
                        <div className="text-xs text-muted-foreground">{a.description}</div>
                        {a.link && (
                          <Button asChild size="sm" variant="link" className="h-6 px-0 mt-1">
                            <Link to={a.link as "/time"}>{a.actionLabel ?? "View"} →</Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
