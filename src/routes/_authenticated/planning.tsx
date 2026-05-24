import { createFileRoute, Link, Outlet, useRouter } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/planning")({
  component: PlanningLayout,
});

function PlanningLayout() {
  const router = useRouter();
  const path = router.state.location.pathname;
  const tabs = [
    { to: "/planning", label: "Today" },
    { to: "/planning/upcoming", label: "Upcoming" },
    { to: "/planning/team", label: "Team" },
    { to: "/planning/new", label: "New plan" },
  ];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Route &amp; Visit Planning</h1>
        <p className="text-sm text-muted-foreground">
          Plan stops in sequence, navigate with one tap, and convert plan stops into real visits.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1 border-b pb-2">
        {tabs.map((t) => {
          const active = path === t.to;
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
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}
