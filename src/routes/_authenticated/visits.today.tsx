import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTodayPlan } from "@/lib/visit-analytics/field-ux.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Sparkles, Clock, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/visits/today")({
  component: TodayPage,
  errorComponent: ({ error }) => <div className="p-4 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-4">Not found</div>,
});

function priorityColor(p: string) {
  return p === "high" ? "destructive" : p === "medium" ? "default" : "secondary";
}

function TodayPage() {
  const fn = useServerFn(getTodayPlan);
  const { data, isLoading } = useQuery({
    queryKey: ["visits", "today-plan"],
    queryFn: () => fn({ data: {} }),
  });

  if (isLoading) return <div className="p-4 text-muted-foreground">Building your plan…</div>;
  if (!data) return null;

  const sections = [
    { key: "scheduled", title: "Scheduled today", icon: Calendar, items: data.scheduled },
    { key: "recommended", title: "AI Recommended", icon: Sparkles, items: data.recommended },
    { key: "followups", title: "Open Follow-ups", icon: Clock, items: data.follow_ups },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Today's Field Plan</h1>
        <p className="text-sm text-muted-foreground">
          {data.summary.total} activities • Pipeline at play:{" "}
          <span className="font-medium text-foreground">
            ৳{data.summary.pipeline_value.toLocaleString()}
          </span>
        </p>
      </header>

      {sections.map((s) => {
        const Icon = s.icon;
        return (
          <Card key={s.key}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Icon className="h-4 w-4 text-primary" />
                {s.title}
                <Badge variant="outline" className="ml-auto">{s.items.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {s.items.length === 0 && (
                <div className="text-sm text-muted-foreground">Nothing here yet.</div>
              )}
              {s.items.map((it, i) => (
                <div
                  key={`${s.key}-${i}`}
                  className="flex flex-col gap-1 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{it.customer_name}</span>
                      <Badge variant={priorityColor(it.priority) as any} className="text-[10px]">
                        {it.priority}
                      </Badge>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{it.reason}</span>
                      {it.city && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {it.city}
                        </span>
                      )}
                      {it.expected_value > 0 && (
                        <span className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" /> ৳{it.expected_value.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {it.lead_id && (
                      <Button asChild size="sm" variant="outline">
                        <Link to="/crm/$leadId" params={{ leadId: it.lead_id }}>Open</Link>
                      </Button>
                    )}
                    <Button asChild size="sm">
                      <Link to="/visits">Log visit</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
