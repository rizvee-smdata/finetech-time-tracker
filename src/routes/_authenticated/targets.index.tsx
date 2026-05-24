import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { fetchTargets } from "@/lib/targets/queries";
import { fetchCompanyMembers } from "@/lib/crm/queries";
import { supabase } from "@/integrations/supabase/client";
import { TargetCard } from "@/components/targets/TargetCard";
import { NewTargetButton } from "@/components/targets/TargetForm";
import { Card } from "@/components/ui/card";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/targets/")({
  component: TargetsActivePage,
});

function TargetsActivePage() {
  const { companyId } = useAuth();
  const today = new Date().toISOString().slice(0, 10);

  const targets = useQuery({
    queryKey: ["targets", companyId],
    enabled: !!companyId,
    queryFn: () => fetchTargets(companyId!),
  });

  const members = useQuery({
    queryKey: ["company-members", companyId],
    enabled: !!companyId,
    queryFn: () => fetchCompanyMembers(companyId!),
  });

  const territories = useQuery({
    queryKey: ["crm-territories", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await sb.from("crm_territories").select("id,name").eq("company_id", companyId);
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const active = useMemo(
    () => (targets.data ?? []).filter((t) => t.period_start <= today && t.period_end >= today),
    [targets.data, today],
  );

  const memberMap = new Map((members.data ?? []).map((m: any) => [m.id, m.full_name ?? m.email] as const));
  const terrMap = new Map((territories.data ?? []).map((t) => [t.id, t.name] as const));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{active.length} active target{active.length === 1 ? "" : "s"}</div>
        <NewTargetButton />
      </div>
      {targets.isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>
      ) : active.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No active targets. Create one to start tracking quota progress.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {active.map((t) => (
            <TargetCard
              key={t.id}
              target={t}
              assigneeName={
                t.scope === "user" ? memberMap.get(t.user_id ?? "") ?? "Unknown rep"
                : t.scope === "territory" ? terrMap.get(t.territory_id ?? "") ?? "Unknown territory"
                : "Whole company"
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
