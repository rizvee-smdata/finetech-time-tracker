import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listReps, getOneOnOneSnapshot } from "@/lib/visit-analytics/smart-plan.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/visits/one-on-one")({
  component: OneOnOnePage,
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

function OneOnOnePage() {
  const fetchReps = useServerFn(listReps);
  const fetchSnap = useServerFn(getOneOnOneSnapshot);
  const [repId, setRepId] = useState<string>("");

  const reps = useQuery({ queryKey: ["reps-1on1"], queryFn: () => fetchReps() });
  const snap = useQuery({
    queryKey: ["1on1-snap", repId],
    queryFn: () => fetchSnap({ data: { repId } }),
    enabled: !!repId,
  });

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Manager 1:1 Prep</h1>
        <p className="text-sm text-muted-foreground">
          Snapshot of a rep's last-30-day field activity, pipeline health, and highlights/concerns to discuss.
        </p>
      </div>

      <div className="max-w-sm">
        <Select value={repId} onValueChange={setRepId}>
          <SelectTrigger><SelectValue placeholder="Select a rep" /></SelectTrigger>
          <SelectContent>
            {(reps.data?.reps ?? []).map((r: { id: string; full_name: string | null; email: string | null }) => (
              <SelectItem key={r.id} value={r.id}>{r.full_name ?? r.email ?? r.id}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!repId ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Select a rep to view their 1:1 snapshot.</CardContent></Card>
      ) : snap.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !snap.data ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No data for this rep.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Visits (30d)" value={snap.data.visits_last_30} />
            <Stat label="Unique accounts" value={snap.data.unique_accounts_visited} />
            <Stat label="Open pipeline" value={`$${Math.round(snap.data.open_pipeline_value / 1000)}k`} />
            <Stat label="Won / Lost" value={`${snap.data.deals_won_30} / ${snap.data.deals_lost_30}`} />
            <Stat label="Low-quality visits" value={snap.data.low_quality_count} />
            <Stat label="Stale deals (21d+)" value={snap.data.stale_accounts} />
          </div>

          {snap.data.highlights.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Highlights</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm">
                  {snap.data.highlights.map((h, i) => (
                    <li key={i} className="flex gap-2"><Badge variant="secondary" className="bg-green-100 text-green-900">✓</Badge>{h}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {snap.data.concerns.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Concerns to discuss</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm">
                  {snap.data.concerns.map((c, i) => (
                    <li key={i} className="flex gap-2"><Badge variant="destructive">!</Badge>{c}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
