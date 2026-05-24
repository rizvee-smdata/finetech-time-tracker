import { createFileRoute, Link, Outlet, useRouter } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/surveys")({
  component: SurveysLayout,
});

function SurveysLayout() {
  const router = useRouter();
  const { isStaff } = useAuth();
  const path = router.state.location.pathname;
  const tabs = [
    { to: "/surveys", label: "Responses" },
    { to: "/surveys/new", label: "Submit feedback" },
    { to: "/surveys/templates", label: "Templates", staffOnly: true },
  ];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Post-visit feedback</h1>
        <p className="text-sm text-muted-foreground">
          Capture customer sentiment after visits, meetings, and demos. Spot at-risk accounts early.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1 border-b pb-2">
        {tabs.filter((t) => !t.staffOnly || isStaff).map((t) => {
          const active = path === t.to;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
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
