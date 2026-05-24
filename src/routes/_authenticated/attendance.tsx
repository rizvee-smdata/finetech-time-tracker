import { createFileRoute, Link, Outlet, useRouter } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/attendance")({
  component: AttendanceLayout,
});

function AttendanceLayout() {
  const router = useRouter();
  const path = router.state.location.pathname;
  const { isStaff, isAdmin } = useAuth();
  const tabs = [
    { to: "/attendance", label: "Today" },
    { to: "/attendance/history", label: "My history" },
    ...(isStaff ? [{ to: "/attendance/team", label: "Team" }] : []),
    ...(isStaff ? [{ to: "/attendance/reports", label: "Reports" }] : []),
    ...(isAdmin ? [{ to: "/attendance/settings", label: "Settings" }] : []),
  ];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
        <p className="text-sm text-muted-foreground">GPS-based check-in / check-out with geofencing.</p>
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
