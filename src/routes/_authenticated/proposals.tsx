import { createFileRoute, Link, Outlet, useRouter } from "@tanstack/react-router";
import { FileText, Library, LayoutTemplate, BarChart3, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/proposals")({
  component: ProposalsLayout,
});

function ProposalsLayout() {
  const router = useRouter();
  const path = router.state.location.pathname;

  const tabs = [
    { to: "/proposals", label: "Library", icon: Library, match: (p: string) => p === "/proposals" || p === "/proposals/" },
    { to: "/proposals/templates", label: "Templates", icon: LayoutTemplate, match: (p: string) => p.startsWith("/proposals/templates") },
    { to: "/proposals/analytics", label: "Analytics", icon: BarChart3, match: (p: string) => p.startsWith("/proposals/analytics") },
  ];

  const inWizard = path.startsWith("/proposals/new");
  const inEditor = /^\/proposals\/[^/]+$/.test(path) && !inWizard && !path.startsWith("/proposals/templates") && !path.startsWith("/proposals/analytics");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Proposals</h1>
            <p className="text-sm text-muted-foreground">
              AI-drafted, client-ready proposals — wizard to PDF in minutes.
            </p>
          </div>
        </div>
        <Button asChild className="bg-emerald-500 text-emerald-50 hover:bg-emerald-600">
          <Link to="/proposals/new">
            <Sparkles className="mr-2 h-4 w-4" /> New Proposal
          </Link>
        </Button>
      </div>

      {!inWizard && !inEditor && (
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
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
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
