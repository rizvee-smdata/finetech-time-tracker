import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  component: AuditPage,
});

function AuditPage() {
  const { isAdmin, companyId } = useAuth();
  const [entityFilter, setEntityFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const { data: logs, isLoading } = useQuery({
    queryKey: ["audit-logs", companyId, entityFilter, actionFilter],
    enabled: !!companyId && isAdmin,
    queryFn: async () => {
      let q = supabase
        .from("audit_logs")
        .select("id, action, entity_type, entity_id, summary, actor_id, created_at")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (entityFilter) q = q.ilike("entity_type", `%${entityFilter}%`);
      if (actionFilter) q = q.eq("action", actionFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Admins only.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          Every create / update / delete on tracked tables in this workspace.
        </p>
      </div>

      <div className="flex gap-3">
        <Input
          placeholder="Filter by entity (e.g. lead, quote)…"
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="max-w-xs"
        />
        <Input
          placeholder="Filter by action (create/update/delete)"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{logs?.length ?? 0} recent events</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (logs?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No events match your filters.</p>
          ) : (
            <div className="divide-y">
              {logs!.map((l: any) => (
                <div key={l.id} className="py-2 flex items-start gap-3 text-sm">
                  <Badge
                    variant={
                      l.action === "delete" ? "destructive" : l.action === "create" ? "default" : "secondary"
                    }
                    className="mt-0.5 capitalize"
                  >
                    {l.action}
                  </Badge>
                  <div className="flex-1">
                    <div className="font-medium">{l.summary || `${l.entity_type} ${l.action}`}</div>
                    <div className="text-xs text-muted-foreground">
                      {l.entity_type} · id {String(l.entity_id).slice(0, 8)}… ·{" "}
                      {formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
