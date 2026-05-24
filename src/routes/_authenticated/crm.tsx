import { createFileRoute, Link, Outlet, useRouter } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/crm")({
  component: CrmLayout,
});

type Tab = { to: string; label: string; aiLabel?: boolean };

const groups: { label: string; tabs: Tab[] }[] = [
  {
    label: "Work",
    tabs: [
      { to: "/crm/inbox", label: "My day" },
      { to: "/crm/hot", label: "Hot leads" },
      { to: "/crm/pipeline", label: "Pipeline" },
      { to: "/crm/list", label: "List" },
      { to: "/crm/activity", label: "Activity" },
      { to: "/crm/calendar", label: "Calendar" },
    ],
  },
  {
    label: "Analyze",
    tabs: [
      { to: "/crm/dashboard", label: "Dashboard" },
      { to: "/crm/insights", label: "Insights", aiLabel: true },
      { to: "/crm/forecast", label: "Forecast" },
      { to: "/crm/velocity", label: "Velocity" },
      { to: "/crm/leaderboard", label: "Leaderboard" },
      { to: "/crm/targets", label: "Targets" },
      { to: "/crm/lost", label: "Lost analysis" },
    ],
  },
  {
    label: "Manage",
    tabs: [
      { to: "/crm/accounts", label: "Accounts" },
      { to: "/crm/quotes", label: "Quotes" },
      { to: "/crm/renewals", label: "Renewals" },
      { to: "/crm/duplicates", label: "Duplicates" },
      { to: "/crm/catalog", label: "Catalog" },
    ],
  },
  {
    label: "Setup",
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

  return (
    <div className="space-y-4">
      {!isDetail && (
        <div className="flex flex-col gap-1.5 border-b pb-2">
          {groups.map((group) => (
            <div key={group.label} className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-16 shrink-0">
                {group.label}
              </span>
              {group.tabs.map((t) => {
                const active = path === t.to || (t.to === "/crm/pipeline" && path === "/crm");
                return (
                  <Link
                    key={t.to}
                    to={t.to}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {t.label}
                    {t.aiLabel && <span className="ml-1 text-[9px] opacity-70">AI</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <Outlet />
    </div>
  );
}
