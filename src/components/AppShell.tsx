import { Link, Outlet, useRouter } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard,
  BookOpen,
  Users,
  ClipboardList,
  Contact,
  Handshake,
  Briefcase,
  Clock,
  LogOut,
  Bell,
  Menu,
  Settings,
  Building2,
  CheckSquare,
  BarChart3,
  Sparkles,
  Target,
  Receipt,
  FileText,
  MapPin,
  Camera,
  Calendar,
  Route as RouteIcon,
  Navigation as NavigationIcon,
  MessageSquare,
  ScrollText,
  AlertTriangle,
  ShieldAlert,
  
  TrendingUp,
  HeartPulse,

} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { lazy, Suspense, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { VisitEntryAlertBanner } from "@/components/visits/VisitEntryAlertBanner";
import { FloatingVoiceButton } from "@/components/voice/FloatingVoiceButton";

// Lazy-load heavy popover widgets — they only render content on click
const NotificationCenter = lazy(() =>
  import("@/components/global/NotificationCenter").then((m) => ({ default: m.NotificationCenter })),
);
const GlobalSearch = lazy(() =>
  import("@/components/global/GlobalSearch").then((m) => ({ default: m.GlobalSearch })),
);
const AIAgentTrigger = lazy(() =>
  import("@/components/global/AIAgent").then((m) => ({ default: m.AIAgentTrigger })),
);



type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }> };
type NavSection = { key: string; label: string; items: NavItem[] };

// Logical groupings — Overview → Sales → Field Ops → People → Performance → Knowledge → Comms → Personal
const navSections: NavSection[] = [
  {
    key: "overview",
    label: "Overview",
    items: [
      { to: "/command", label: "Command Center", icon: Sparkles },
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    key: "sales",
    label: "Sales & Pipeline",
    items: [
      { to: "/crm", label: "CRM", icon: Target },
      { to: "/deals", label: "Deal Health", icon: TrendingUp },
      { to: "/proposals", label: "Proposals", icon: FileText },
      { to: "/proposals/brief", label: "AI Proposal Brief", icon: Sparkles },
      { to: "/contracts", label: "Contracts", icon: FileText },
      { to: "/followups", label: "Follow-ups", icon: Bell },
    ],
  },
  {
    key: "field",
    label: "Field Operations",
    items: [
      { to: "/visits", label: "Visits", icon: ClipboardList },
      { to: "/visits/coverage", label: "Coverage Map", icon: MapPin },
      { to: "/visits/needs-attention", label: "Needs Attention", icon: ClipboardList },
      { to: "/visits/rep-comparison", label: "Rep Comparison", icon: ClipboardList },
      { to: "/visits/integrity", label: "Integrity Review", icon: ShieldAlert },
      { to: "/visits/deal-correlation", label: "Deal Correlation", icon: TrendingUp },
      { to: "/visits/renewals", label: "Renewal Radar", icon: Bell },
      { to: "/visits/oem-health", label: "OEM Health", icon: Target },
      { to: "/visits/settings", label: "Visit Settings", icon: ClipboardList },
      { to: "/ai-visits/new", label: "AI Visit Summary", icon: Sparkles },
      { to: "/voice/history", label: "Voice Notes", icon: Sparkles },
      { to: "/planning", label: "Planning", icon: RouteIcon },
      { to: "/route/plan", label: "AI Route Planner", icon: Sparkles },
      { to: "/route/live", label: "Live Route", icon: NavigationIcon },
      { to: "/gps/today", label: "Route", icon: NavigationIcon },
      { to: "/gps/checkin", label: "GPS Check-in", icon: MapPin },
      { to: "/scan", label: "Scan Card", icon: Camera },
    ],
  },
  {
    key: "people",
    label: "People & Accounts",
    items: [
      { to: "/customers", label: "Customers", icon: Contact },
      { to: "/clients/health", label: "Client Health", icon: HeartPulse },
      { to: "/partners", label: "Partners", icon: Handshake },
      { to: "/consultants", label: "Consultants", icon: Briefcase },
    ],
  },
  {
    key: "work",
    label: "Work & Time",
    items: [
      { to: "/tasks", label: "Tasks", icon: CheckSquare },
      { to: "/check-in", label: "Check-in", icon: Clock },
      { to: "/attendance", label: "Attendance", icon: MapPin },
      { to: "/expenses", label: "Expenses", icon: Receipt },
    ],
  },
  {
    key: "performance",
    label: "Performance",
    items: [
      { to: "/targets", label: "Targets", icon: Target },
      { to: "/scorecard/me", label: "Scorecard", icon: TrendingUp },
      { to: "/predictor/me", label: "AI Predictor", icon: Sparkles },
      { to: "/coach/me", label: "AI Sales Coach", icon: Sparkles },
      { to: "/prep/history", label: "AI Meeting Prep", icon: Sparkles },
    ],
  },
  {
    key: "knowledge",
    label: "Knowledge & Feedback",
    items: [
      { to: "/kb", label: "Knowledge Base", icon: BookOpen },
      { to: "/surveys", label: "Feedback", icon: MessageSquare },
    ],
  },
  {
    key: "comms",
    label: "Communication",
    items: [
      { to: "/chat", label: "Team Chat", icon: MessageSquare },
      { to: "/settings/whatsapp", label: "WhatsApp Bot", icon: MessageSquare },
      { to: "/reminders", label: "Reminders", icon: Bell },
    ],
  },
  {
    key: "personal",
    label: "Personal",
    items: [
      { to: "/preferences", label: "Preferences", icon: Settings },
    ],
  },
];

const staffSection: NavSection = {
  key: "management",
  label: "Management & Insights",
  items: [
    { to: "/team", label: "Team", icon: Users },
    { to: "/manager/dashboard", label: "Manager", icon: LayoutDashboard },
    { to: "/reports", label: "Reports", icon: BarChart3 },
    { to: "/predictor/team", label: "Team Predictor", icon: TrendingUp },
    { to: "/coach/team", label: "Team Coaching", icon: Sparkles },
    { to: "/admin/routes", label: "Team Routes Map", icon: NavigationIcon },
    { to: "/copilot", label: "AI Copilot", icon: Sparkles },
    { to: "/copilot/anomalies", label: "Anomaly Feed", icon: AlertTriangle },
    { to: "/narratives", label: "Exec Narratives", icon: ScrollText },
    { to: "/ai", label: "Ask AI", icon: Sparkles },
  ],
};

const adminSection: NavSection = {
  key: "admin",
  label: "Administration",
  items: [
    { to: "/audit", label: "Audit log", icon: ScrollText },
    { to: "/settings", label: "Settings", icon: Settings },
  ],
};


export function AppShell() {
  const { user, isStaff, isAdmin, companies, companyId, setCompanyId, company, loading, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const path = router.state.location.pathname;

  useEffect(() => {
    if (!loading && !user) window.location.href = "/auth";
  }, [loading, user]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Redirecting…
      </div>
    );
  }

  const sections: NavSection[] = [
    ...navSections,
    ...(isStaff ? [staffSection] : []),
    ...(isAdmin ? [adminSection] : []),
  ];

  const switcher = companies.length > 0 && (
    <div className="px-3 pb-2">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Building2 className="h-3 w-3" /> Company
      </div>
      <Select value={companyId ?? undefined} onValueChange={(v) => setCompanyId(v)}>
        <SelectTrigger className="h-9"><SelectValue placeholder="Select company" /></SelectTrigger>
        <SelectContent>
          {companies.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar (mobile) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card/80 px-4 py-3 backdrop-blur md:hidden">
        <button
          onClick={() => setOpen(!open)}
          aria-label="Open menu"
          className="rounded-md p-2 hover:bg-accent"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="truncate font-semibold tracking-tight text-primary">
          {company?.name ?? "Lavisho Tracker"}
        </div>
        <div className="flex items-center gap-1">
          <Suspense fallback={null}>
            <AIAgentTrigger />
            <GlobalSearch />
            <NotificationCenter />
          </Suspense>
          <NotificationBell compact />
          <Button variant="ghost" size="icon" aria-label="Sign out" onClick={signOut}><LogOut className="h-4 w-4" /></Button>
        </div>

      </header>

      {/* Desktop floating bell */}
      <div className="fixed right-4 top-3 z-30 hidden items-center gap-2 md:flex">
        <Suspense fallback={null}>
          <AIAgentTrigger />
          <GlobalSearch />
          <NotificationCenter />
        </Suspense>
        <NotificationBell compact />
      </div>



      <div className="flex">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex w-64 transform flex-col border-r border-border bg-card transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0",
            open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          )}
        >
          <div className="flex h-16 items-center gap-2 border-b border-border px-6">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--gradient-primary)] text-primary-foreground font-bold shadow-[var(--shadow-elegant)]">
              L
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">Lavisho Group</div>
              <div className="truncate text-xs text-muted-foreground">{company?.name ?? "Workspace"}</div>
            </div>
          </div>
          <div className="pt-3">{switcher}</div>
          <nav className="flex-1 min-h-0 overflow-y-auto p-3 [scrollbar-width:thin]">
            {sections.map((section) => (
              <div key={section.key} className="mb-4">
                <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {section.label}
                </div>
                <div className="space-y-1">
                  {section.items.map((it) => {
                    const active = path === it.to || path.startsWith(it.to + "/");
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
                </div>
              </div>
            ))}
          </nav>
          <div className="border-t border-border p-3">
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

        <main className="flex-1 p-4 pb-28 md:p-8 md:pb-20">
          {!companyId && companies.length === 0 && !path.startsWith("/settings") && (
            <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-warning/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              {isAdmin ? (
                <>
                  <span>No companies exist yet. Create your first Lavisho Group company to get started.</span>
                  <Button asChild size="sm">
                    <Link to="/settings">Open Settings</Link>
                  </Button>
                </>
              ) : (
                <span>You're not assigned to any company yet. Ask an admin to add you to a Lavisho Group company.</span>
              )}
            </div>
          )}
          <VisitEntryAlertBanner />
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border bg-card/95 backdrop-blur md:hidden">
        {[
          { to: "/crm", label: "Pipeline", icon: Target },
          { to: "/visits", label: "Visits", icon: ClipboardList },
          { to: "/tasks", label: "Tasks", icon: CheckSquare },
          { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        ].map((it) => {
          const active = path.startsWith(it.to);
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              {it.label}
            </Link>
          );
        })}
      </nav>

      <FloatingVoiceButton />
    </div>
  );
}
