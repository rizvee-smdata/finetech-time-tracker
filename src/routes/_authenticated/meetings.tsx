import { createFileRoute, Link, Outlet, useRouter } from "@tanstack/react-router";
import { Sparkles, History, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/meetings")({
  component: MeetingsLayout,
});

function MeetingsLayout() {
  const router = useRouter();
  const path = router.state.location.pathname;

  const tabs = [
    { to: "/meetings", label: "New Meeting", icon: Sparkles, match: (p: string) => p === "/meetings" || p === "/meetings/" },
    { to: "/meetings/history", label: "Meeting History", icon: History, match: (p: string) => p.startsWith("/meetings/history") },
    { to: "/meetings/actions", label: "Action Items", icon: ListChecks, match: (p: string) => p.startsWith("/meetings/actions") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-amber-500/20 text-amber-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Meeting Intelligence</h1>
            <p className="text-sm text-muted-foreground">
              Turn raw meeting notes into action items, CRM updates, and follow-up emails.
            </p>
          </div>
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
                  ? "bg-amber-500/15 text-amber-500"
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
