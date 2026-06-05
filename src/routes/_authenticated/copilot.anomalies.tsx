import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, X, ArrowLeft, Lightbulb } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { dismissAnomaly, listAnomalies } from "@/lib/copilot/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/copilot/anomalies")({
  component: AnomaliesPage,
});

const SEVERITY_STYLE: Record<string, string> = {
  high: "border-red-500/50 bg-red-500/5",
  medium: "border-amber-500/50 bg-amber-500/5",
  low: "border-emerald-500/50 bg-emerald-500/5",
};

function AnomaliesPage() {
  const { user, companyId } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["copilot-anomalies", companyId],
    enabled: !!companyId,
    queryFn: () => listAnomalies(companyId!),
  });

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/copilot"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <AlertTriangle className="h-5 w-5 text-amber-500" />
        <h1 className="text-xl font-semibold">Anomaly Feed</h1>
      </div>

      <p className="text-sm text-muted-foreground">
        Unusual patterns detected daily across visits, deals, expenses, and engagement.
      </p>

      {isLoading && <Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card>}

      {!isLoading && (data ?? []).length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No active anomalies. Nice work.
        </Card>
      )}

      <div className="grid gap-2">
        {(data ?? []).map((a) => (
          <Card key={a.id} className={cn("p-3 border-l-4", SEVERITY_STYLE[a.severity])}>
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-sm">{a.title}</h3>
                  <Badge variant="outline" className="text-[10px]">{a.severity}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{a.description}</p>
                {a.suggested_action && (
                  <div className="flex items-start gap-1.5 text-xs text-foreground/80 mt-1 bg-muted/40 rounded p-2">
                    <Lightbulb className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
                    <span>{a.suggested_action}</span>
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground">
                  Detected {new Date(a.created_at).toLocaleString()}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={async () => {
                if (!user) return;
                await dismissAnomaly(a.id, user.id);
                await qc.invalidateQueries({ queryKey: ["copilot-anomalies", companyId] });
              }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
