import { createFileRoute, Link, Outlet, useRouter } from "@tanstack/react-router";
import { Activity, ListChecks, TrendingUp, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/deals")({
  component: DealsLayout,
});

function DealsLayout() {
  const router = useRouter();
  const path = router.state.location.pathname;

  const tabs = [
    {
      to: "/deals",
      label: "Pipeline",
      icon: Activity,
      match: (p: string) =>
        p === "/deals" ||
        p === "/deals/" ||
        (p.startsWith("/deals/") &&
          !p.startsWith("/deals/actions") &&
          !p.startsWith("/deals/insights")),
    },
    {
      to: "/deals/actions",
      label: "Action Center",
      icon: ListChecks,
      match: (p: string) => p.startsWith("/deals/actions"),
    },
    {
      to: "/deals/insights",
      label: "Win/Loss Insights",
      icon: Trophy,
      match: (p: string) => p.startsWith("/deals/insights"),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-blue-500/20 text-blue-400">
          <TrendingUp className="h-4 w-4" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Deal Health</h1>
          <p className="text-sm text-muted-foreground">
            Score every deal, get AI-powered next best actions, and never let a deal go cold.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border border-border/60 bg-card/40 p-1 backdrop-blur">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = t.match(path);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-blue-500/15 text-blue-400"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
      </div>

      <Outlet />
    </div>
  );
}
