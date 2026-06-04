import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ragColor, type Rag } from "@/lib/clientHealth";
import { AlertTriangle } from "lucide-react";

/**
 * Manager-facing live feed of accounts that changed RAG status today.
 * Subscribes to public.client_health_rag_alerts realtime channel.
 */
export function HealthAlertFeed({ limit = 8 }: { limit?: number }) {
  const { companyId } = useAuth();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["health-rag-alerts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("client_health_rag_alerts")
        .select("id, account_id, account_name, from_rag, to_rag, score, last_visit_days, created_at")
        .eq("company_id", companyId!)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!companyId) return;
    const ch = supabase
      .channel("rag-alerts")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "client_health_rag_alerts", filter: `company_id=eq.${companyId}` },
        () => qc.invalidateQueries({ queryKey: ["health-rag-alerts", companyId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId, qc]);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Client health alerts
        </div>
        <Button asChild variant="ghost" size="sm"><Link to="/clients/health">Open dashboard</Link></Button>
      </div>
      <ul className="space-y-2">
        {(data ?? []).map((a: any) => (
          <li key={a.id} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0 text-sm">
            <div className="min-w-0">
              <Link to="/clients/$clientId/health" params={{ clientId: a.account_id }}
                className="truncate font-medium hover:underline">
                {a.account_name}
              </Link>
              <div className="text-xs text-muted-foreground">
                {a.from_rag ? `${a.from_rag} → ${a.to_rag}` : `new · ${a.to_rag}`}
                {" · "}{new Date(a.created_at).toLocaleDateString()}
              </div>
            </div>
            <Badge variant="outline" className={ragColor(a.to_rag as Rag)}>{a.score}</Badge>
          </li>
        ))}
        {(data ?? []).length === 0 && (
          <li className="text-sm text-muted-foreground">No RAG changes in the last 7 days.</li>
        )}
      </ul>
    </Card>
  );
}
