import { Link, Outlet, useRouter } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Clock,
  LogOut,
  Bell,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/visits", label: "Visits", icon: ClipboardList },
  { to: "/check-in", label: "Time", icon: Clock },
  { to: "/reminders", label: "Reminders", icon: Bell },
];

export function AppShell() {
  const { user, isStaff, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const path = router.state.location.pathname;

  const items = [...nav, ...(isStaff ? [{ to: "/team", label: "Team", icon: Users }] : [])];

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar (mobile) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card/80 px-4 py-3 backdrop-blur md:hidden">
        <button onClick={() => setOpen(!open)} className="rounded-md p-2 hover:bg-accent">
          <Menu className="h-5 w-5" />
        </button>
        <div className="font-semibold tracking-tight text-primary">Lavisho Tracker</div>
        <Button variant="ghost" size="icon" onClick={signOut}><LogOut className="h-4 w-4" /></Button>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-64 transform border-r border-border bg-card transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0",
            open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          )}
        >
          <div className="flex h-16 items-center gap-2 border-b border-border px-6">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--gradient-primary)] text-primary-foreground font-bold shadow-[var(--shadow-elegant)]">
              L
            </div>
            <div>
              <div className="text-sm font-semibold">Lavisho Group</div>
              <div className="text-xs text-muted-foreground">Time Tracker</div>
            </div>
          </div>
          <nav className="space-y-1 p-3">
            {items.map((it) => {
              const active = path.startsWith(it.to);
              const Icon = it.icon;
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {it.label}
                </Link>
              );
            })}
          </nav>
          <div className="absolute bottom-0 left-0 right-0 border-t border-border p-3">
            <div className="mb-2 truncate px-3 text-xs text-muted-foreground">{user?.email}</div>
            <Button variant="outline" size="sm" className="w-full" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </div>
        </aside>

        {open && (
          <div
            className="fixed inset-0 z-30 bg-foreground/30 md:hidden"
            onClick={() => setOpen(false)}
          />
        )}

        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
