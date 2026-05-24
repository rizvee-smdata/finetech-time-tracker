import { createFileRoute, Link, Outlet, useRouter } from "@tanstack/react-router";
import { Bell, Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reminders")({
  component: RemindersLayout,
});

function RemindersLayout() {
  const router = useRouter();
  const path = router.state.location.pathname;
  const tabs = [
    { to: "/reminders", label: "Inbox", icon: Bell, exact: true },
    { to: "/reminders/preferences", label: "Preferences", icon: SettingsIcon },
  ];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          Reminders, mentions and signals from across your workspace.
        </p>
      </div>
      <div className="flex flex-wrap gap-1 border-b">
        {tabs.map((t) => {
          const active = t.exact ? path === t.to : path === t.to || path.startsWith(t.to + "/");
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to as "/reminders"}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}
