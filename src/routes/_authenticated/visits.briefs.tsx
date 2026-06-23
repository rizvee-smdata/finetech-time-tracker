import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getSmartPlan, getVisitBriefs } from "@/lib/visit-analytics/smart-plan.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/visits/briefs")({
  component: BriefsPage,
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

function BriefsPage() {
  const fetchPlan = useServerFn(getSmartPlan);
  const fetchBriefs = useServerFn(getVisitBriefs);

  const plan = useQuery({
    queryKey: ["smart-plan-for-briefs"],
    queryFn: () => fetchPlan({ data: { limit: 10 } }),
  });

  const accountIds = plan.data?.stops.map((s) => s.account_id) ?? [];

  const briefs = useQuery({
    queryKey: ["visit-briefs", accountIds],
    queryFn: () => fetchBriefs({ data: { accountIds } }),
    enabled: accountIds.length > 0,
  });

  const loading = plan.isLoading || briefs.isLoading;

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Auto Visit Briefs</h1>
        <p className="text-sm text-muted-foreground">
          One-page briefs for your top suggested visits — pulled from prior visit history and open deals.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
      ) : !briefs.data?.briefs.length ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No briefs available yet.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {briefs.data.briefs.map((b) => (
            <Card key={b.account_id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{b.account_name}</CardTitle>
                <div className="text-xs text-muted-foreground">
                  {b.last_visit_date ? `Last visit: ${new Date(b.last_visit_date).toLocaleDateString()}` : "No prior visits"}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <div className="font-medium mb-1">Focus</div>
                  <div className="text-muted-foreground">{b.suggested_focus}</div>
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <Badge variant="outline">{b.open_deal_count} open deal(s)</Badge>
                  <Badge variant="outline">${Math.round(b.open_deal_value).toLocaleString()}</Badge>
                </div>
                {b.last_visit_summary && (
                  <div>
                    <div className="font-medium mb-1">Last meeting</div>
                    <div className="text-muted-foreground">{b.last_visit_summary}</div>
                  </div>
                )}
                {b.open_next_actions.length > 0 && (
                  <div>
                    <div className="font-medium mb-1">Open next actions</div>
                    <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                      {b.open_next_actions.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </div>
                )}
                {b.recent_topics.length > 0 && (
                  <div>
                    <div className="font-medium mb-1">Recent topics</div>
                    <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                      {b.recent_topics.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
