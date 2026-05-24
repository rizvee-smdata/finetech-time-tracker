import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { fetchTargets } from "@/lib/targets/queries";
import { fetchCompanyMembers } from "@/lib/crm/queries";
import { supabase } from "@/integrations/supabase/client";
import { TargetCard } from "@/components/targets/TargetCard";
import { Card } from "@/components/ui/card";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/targets/all")({
  component: AllTargetsPage,
});

function AllTargetsPage() {
  const { companyId } = useAuth();

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

  const memberMap = new Map((members.data ?? []).map((m: any) => [m.id, m.full_name ?? m.email] as const));
  const terrMap = new Map((territories.data ?? []).map((t) => [t.id, t.name] as const));
  const list = targets.data ?? [];

  if (targets.isLoading) return <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>;
  if (!list.length) return <Card className="p-8 text-center text-sm text-muted-foreground">No targets yet.</Card>;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {list.map((t) => (
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
  );
}
