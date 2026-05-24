import { createFileRoute, Link, Outlet, useRouter } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/crm")({
  component: CrmLayout,
});

function CrmLayout() {
  const router = useRouter();
  const path = router.state.location.pathname;
  const tabs = [
    { to: "/crm/inbox", label: "My day" },
    { to: "/crm/pipeline", label: "Pipeline" },
    { to: "/crm/list", label: "List" },
    { to: "/crm/dashboard", label: "Dashboard" },
    { to: "/crm/forecast", label: "Forecast" },
    { to: "/crm/renewals", label: "Renewals" },
    { to: "/crm/lost", label: "Lost analysis" },
    { to: "/crm/accounts", label: "Accounts" },
    { to: "/crm/catalog", label: "Catalog" },
    { to: "/crm/territories", label: "Territories" },
    { to: "/crm/settings", label: "Settings" },
  ];

  // Detail view: hide tabs
  const isDetail = /^\/crm\/[^/]+$/.test(path) && !tabs.some((t) => path === t.to);

  return (
    <div className="space-y-4">
      {!isDetail && (
        <div className="flex items-center gap-1 border-b">
          {tabs.map((t) => {
            const active = path === t.to || (t.to === "/crm/pipeline" && path === "/crm");
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "border-b-2 px-4 py-2 text-sm font-medium -mb-px transition-colors",
                  active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      )}
      <Outlet />
    </div>
  );
}
