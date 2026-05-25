import { createFileRoute, Link, Outlet, useRouter } from "@tanstack/react-router";
import { Briefcase, BarChart3, FolderKanban, Settings as SettingsIcon } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/_authenticated/crm")({
  component: CrmLayout,
});

type Tab = { to: string; label: string; aiLabel?: boolean };
type Group = { key: string; label: string; icon: React.ComponentType<{ className?: string }>; tabs: Tab[] };

const groups: Group[] = [
  {
    key: "work",
    label: "Work",
    icon: Briefcase,
    tabs: [
      { to: "/crm/inbox", label: "My Day" },
      { to: "/crm/hot", label: "Hot Leads" },
      { to: "/crm/pipeline", label: "Pipeline" },
      { to: "/crm/list", label: "List" },
      { to: "/crm/activity", label: "Activity" },
      { to: "/crm/calendar", label: "Calendar" },
    ],
  },
  {
    key: "analyze",
    label: "Analyze",
    icon: BarChart3,
    tabs: [
      { to: "/crm/dashboard", label: "Dashboard" },
      { to: "/crm/insights", label: "Insights", aiLabel: true },
      { to: "/crm/forecast", label: "Forecast" },
      { to: "/crm/velocity", label: "Velocity" },
      { to: "/crm/leaderboard", label: "Leaderboard" },
      { to: "/crm/targets", label: "Targets" },
      { to: "/crm/lost", label: "Lost Analysis" },
    ],
  },
  {
    key: "manage",
    label: "Manage",
    icon: FolderKanban,
    tabs: [
      { to: "/crm/accounts", label: "Accounts" },
      { to: "/crm/quotes", label: "Quotes" },
      { to: "/crm/renewals", label: "Renewals" },
      { to: "/crm/duplicates", label: "Duplicates" },
      { to: "/crm/catalog", label: "Catalog" },
    ],
  },
  {
    key: "setup",
    label: "Setup",
    icon: SettingsIcon,
    tabs: [
      { to: "/crm/templates", label: "Templates" },
      { to: "/crm/sequences", label: "Sequences" },
      { to: "/crm/territories", label: "Territories" },
      { to: "/crm/capture", label: "Capture" },
      { to: "/crm/settings", label: "Settings" },
    ],
  },
];

function CrmLayout() {
  const router = useRouter();
  const path = router.state.location.pathname;
  const allTabs = groups.flatMap((g) => g.tabs);

  const isDetail = /^\/crm\/[^/]+$/.test(path) && !allTabs.some((t) => path === t.to);

  // Group derived from current URL (when matchable)
  const urlGroup = groups.find((g) => g.tabs.some((t) => path === t.to));

  // Local state for which primary tab is selected (so clicking Analyze/Manage/Setup
  // immediately swaps the sub-nav without requiring navigation)
  const [activeGroupKey, setActiveGroupKey] = useState<string>(
    (urlGroup ?? groups[0]).key,
  );

  // Keep selection in sync when URL changes to a route in a different group
  useEffect(() => {
    if (urlGroup && urlGroup.key !== activeGroupKey) {
      setActiveGroupKey(urlGroup.key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const activeGroup = groups.find((g) => g.key === activeGroupKey) ?? groups[0];

  return (
    <div className="space-y-3">
      {!isDetail && (
        <div className="sticky top-0 z-20 -mx-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          {/* Primary tabs */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
            {groups.map((g) => {
              const Icon = g.icon;
              const active = g.key === activeGroup.key;
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setActiveGroupKey(g.key)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{g.label}</span>
                </button>
              );
            })}
          </div>

          {/* Secondary sub-nav */}
          <div className="flex items-center gap-1 overflow-x-auto py-1.5 scrollbar-none">
            {activeGroup.tabs.map((t) => {
              const active =
                path === t.to ||
                (t.to === "/crm/pipeline" && (path === "/crm" || path === "/crm/"));
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  className={cn(
                    "shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {t.label}
                  {t.aiLabel && <span className="ml-1 text-[9px] opacity-70">AI</span>}
                </Link>
              );
            })}
          </div>
        </div>
      )}
      <Outlet />
    </div>
  );
}

