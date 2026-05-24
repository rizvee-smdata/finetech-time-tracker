import { createFileRoute, Link, Outlet, useRouter } from "@tanstack/react-router";
import { Clock, CalendarDays, DollarSign, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/time")({
  component: TimeLayout,
});

function TimeLayout() {
  const router = useRouter();
  const path = router.state.location.pathname;
  const tabs = [
    { to: "/time", label: "Time Tracker", icon: Clock, match: (p: string) => p === "/time" || p === "/time/" },
    { to: "/time/sheet", label: "Timesheet", icon: CalendarDays, match: (p: string) => p.startsWith("/time/sheet") },
    { to: "/time/revenue", label: "Revenue Intelligence", icon: DollarSign, match: (p: string) => p.startsWith("/time/revenue") },
    { to: "/time/dashboard", label: "Executive Dashboard", icon: LayoutDashboard, match: (p: string) => p.startsWith("/time/dashboard") },
  ];
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-violet-500/20 text-violet-300">
          <Clock className="h-4 w-4" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Time Tracker</h1>
          <p className="text-sm text-muted-foreground">Track every billable minute and turn it into revenue intelligence.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 rounded-lg border border-border/60 bg-card/40 p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = t.match(path);
          return (
            <Link key={t.to} to={t.to} className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-violet-500/15 text-violet-300" : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}>
              <Icon className="h-4 w-4" />{t.label}
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}
