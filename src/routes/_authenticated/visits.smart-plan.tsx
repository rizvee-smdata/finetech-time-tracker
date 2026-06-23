import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getSmartPlan } from "@/lib/visit-analytics/smart-plan.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/visits/smart-plan")({
  component: SmartPlanPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <p className="text-destructive">Failed to load: {error.message}</p>
        <button onClick={() => { reset(); router.invalidate(); }} className="underline text-sm mt-2">Retry</button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">Not found</div>,
});

function SmartPlanPage() {
  const fetchPlan = useServerFn(getSmartPlan);
  const { data, isLoading } = useQuery({
    queryKey: ["smart-plan"],
    queryFn: () => fetchPlan({ data: { limit: 20 } }),
  });

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Smart Visit Planner</h1>
        <p className="text-sm text-muted-foreground">
          Ranked list of accounts to visit next based on visit recency, deal value, and renewal proximity.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : !data?.stops.length ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">
          No active accounts assigned. Plan suggestions appear once you have open deals.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {data.stops.map((s, i) => (
            <Card key={s.account_id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="text-muted-foreground">#{i + 1}</span>
                    {s.account_name}
                  </CardTitle>
                  <Badge variant={s.score >= 50 ? "destructive" : s.score >= 30 ? "default" : "secondary"}>
                    Score {s.score}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                <div className="flex flex-wrap gap-1">
                  {s.reason.map((r, idx) => (
                    <Badge key={idx} variant="outline">{r}</Badge>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground flex gap-4 flex-wrap">
                  <span>{s.open_deals_count} open deal(s)</span>
                  <span>${Math.round(s.open_deals_value).toLocaleString()} pipeline</span>
                  {s.renewal_date && <span>Renewal: {new Date(s.renewal_date).toLocaleDateString()}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
