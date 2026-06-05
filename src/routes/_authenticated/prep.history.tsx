import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, ChevronRight, History } from "lucide-react";
import { listBriefsForUser, healthColor } from "@/lib/meetingPrep";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/prep/history")({
  component: PrepHistoryPage,
});

function PrepHistoryPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["prep-history", user?.id],
    enabled: !!user?.id,
    queryFn: () => listBriefsForUser(user!.id, 100),
  });

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <History className="size-5 text-primary" />
        <h1 className="text-xl font-semibold">Past Meeting Briefs</h1>
      </div>

      {isLoading && (
        <div className="grid gap-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      )}

      {!isLoading && (data?.length ?? 0) === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No briefs yet. They appear here 30 minutes before each client visit.
        </Card>
      )}

      <div className="grid gap-2">
        {(data ?? []).map((b) => (
          <Link key={b.id} to="/prep/$taskId" params={{ taskId: b.task_id }}>
            <Card className="p-3 hover:bg-muted/40 transition-colors">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-md bg-primary/10 grid place-items-center text-primary shrink-0">
                  <Sparkles className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {b.brief?.one_key_priority ?? "Brief"}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                    {b.scheduled_at && <span>{format(new Date(b.scheduled_at), "MMM d, h:mm a")}</span>}
                    <Badge variant="outline" className="text-[10px]">{b.status}</Badge>
                    {b.brief?.relationship_health && (
                      <Badge className={healthColor(b.brief.relationship_health)}>
                        {b.brief.relationship_health}
                      </Badge>
                    )}
                    {b.prepared_at && <Badge variant="secondary">prepared ✓</Badge>}
                  </div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground shrink-0" />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
