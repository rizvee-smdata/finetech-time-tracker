import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getVisitHeatmap } from "@/lib/visit-analytics/field-ux.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";

export const Route = createFileRoute("/_authenticated/visits/heatmap")({
  component: HeatmapPage,
  errorComponent: ({ error }) => <div className="p-4 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-4">Not found</div>,
});

function statusBg(s: string) {
  if (s === "hot") return "bg-destructive/15 border-destructive/40";
  if (s === "warm") return "bg-amber-500/15 border-amber-500/40";
  return "bg-muted border-border";
}

function HeatmapPage() {
  const fn = useServerFn(getVisitHeatmap);
  const { data, isLoading } = useQuery({
    queryKey: ["visits", "heatmap"],
    queryFn: () => fn({ data: { days: 30 } }),
  });

  if (isLoading) return <div className="p-4 text-muted-foreground">Loading coverage…</div>;
  const cells = data?.cells ?? [];
  const totalVisits = cells.reduce((s, c) => s + c.visits, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Visit Heatmap</h1>
        <p className="text-sm text-muted-foreground">
          {totalVisits} visits across {cells.length} cities in the last 30 days
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coverage by City</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {cells.map((c) => (
              <div
                key={c.city}
                className={`rounded-lg border p-4 transition ${statusBg(c.status)}`}
              >
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <MapPin className="h-3.5 w-3.5" /> {c.city}
                </div>
                <div className="mt-2 text-2xl font-semibold">{c.visits}</div>
                <div className="text-xs text-muted-foreground">
                  {c.unique_accounts} accounts
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px] uppercase">{c.status}</Badge>
                  {c.last_visit_days !== null && (
                    <span className="text-[10px] text-muted-foreground">
                      {c.last_visit_days}d ago
                    </span>
                  )}
                </div>
              </div>
            ))}
            {cells.length === 0 && (
              <div className="col-span-full text-sm text-muted-foreground">
                No visits with location data in the last 30 days.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
