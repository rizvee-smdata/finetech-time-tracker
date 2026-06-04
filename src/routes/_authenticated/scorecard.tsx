import { createFileRoute, Link, Outlet, useRouter } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { User, History, Users, Target } from "lucide-react";

export const Route = createFileRoute("/_authenticated/scorecard")({
  component: ScorecardLayout,
});

function ScorecardLayout() {
  const { isStaff } = useAuth();
  const router = useRouter();
  const path = router.state.location.pathname;

  const tabs = [
    { to: "/scorecard/me", label: "My Scorecard", icon: User, staffOnly: false },
    { to: "/scorecard/history", label: "History", icon: History, staffOnly: false },
    { to: "/scorecard/team", label: "Team", icon: Users, staffOnly: true },
    { to: "/scorecard/goals", label: "Goals", icon: Target, staffOnly: true },
  ];

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur print:hidden">
        <div className="flex items-center gap-1 overflow-x-auto px-4 py-2">
          {tabs.filter(t => !t.staffOnly || isStaff).map((t) => {
            const Icon = t.icon;
            const active = path.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}
