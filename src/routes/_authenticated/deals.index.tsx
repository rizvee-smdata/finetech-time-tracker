import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { differenceInDays } from "date-fns";
import { toast } from "sonner";
import { PipelineSummary } from "@/components/deals/PipelineSummary";
import { PipelineBoard } from "@/components/deals/PipelineBoard";
import {
  PipelineFilters,
  type PipelineFiltersValue,
} from "@/components/deals/PipelineFilters";
import { useDealsStore } from "@/lib/deals/storage";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { calculateHealthScore } from "@/lib/deals/scoring";
import type { Deal, DealStage } from "@/lib/deals/types";

export const Route = createFileRoute("/_authenticated/deals/")({
  component: PipelinePage,
});

const sb = supabase as any;

// Map a CRM lead stage to the Deal Health pipeline stage.
function mapStage(stage: string | null | undefined): DealStage {
  switch (stage) {
    case "new":
    case "contacted":
      return "Prospecting";
    case "qualified":
      return "Discovery";
    case "proposal":
      return "Proposal";
    case "negotiation":
      return "Negotiation";
    case "won":
      return "Closed Won";
    case "lost":
      return "Closed Lost";
    default:
      return "Prospecting";
  }
}

function leadToDeal(l: any): Deal {
  const created = l.created_at ?? new Date().toISOString();
  const last = l.last_activity_at ?? l.updated_at ?? created;
  const base: Deal = {
    id: l.id,
    title: l.customer_name || l.company_name || "Untitled deal",
    clientName: l.contact_person || l.customer_name || "",
    clientCompany: l.company_name || l.customer_name || "",
    industry: l.industry || "Other",
    dealValue: Number(l.expected_value) || 0,
    currency: "USD",
    stage: mapStage(l.stage),
    probability: Number(l.probability) || 0,
    createdAt: created,
    expectedCloseDate: l.expected_close_date || created,
    lastContactDate: last,
    assignedTo: l.assigned_to || "",
    competitors: l.competitor_name ? [l.competitor_name] : [],
    products: l.product_name ? [l.product_name] : [],
    interactions: [],
    lossReason: l.lost_reason || undefined,
  };
  return { ...base, healthScore: calculateHealthScore(base) };
}

function PipelinePage() {
  const { companyId } = useAuth();
  const { deals: storedDeals, recalculateAll } = useDealsStore();

  const leadsQuery = useQuery({
    queryKey: ["deals-from-leads", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("crm_leads")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("last_activity_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []).map(leadToDeal) as Deal[];
    },
  });

  // Prefer real CRM leads for the pipeline. Fall back to any locally stored
  // deals so nothing users manually added is lost.
  const deals = useMemo<Deal[]>(() => {
    const list = leadsQuery.data ?? [];
    return list.length ? list : storedDeals;
  }, [leadsQuery.data, storedDeals]);

  const [filters, setFilters] = useState<PipelineFiltersValue>({
    query: "",
    healthStatus: "all",
    industry: "all",
    assignedTo: "all",
    sortBy: "health",
  });

  const industries = useMemo(
    () => Array.from(new Set(deals.map((d) => d.industry))).filter(Boolean).sort(),
    [deals],
  );
  const assignees = useMemo(
    () => Array.from(new Set(deals.map((d) => d.assignedTo))).filter(Boolean).sort(),
    [deals],
  );

  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return deals
      .filter((d) => {
        if (
          q &&
          !`${d.title} ${d.clientName} ${d.clientCompany}`.toLowerCase().includes(q)
        )
          return false;
        if (filters.healthStatus !== "all" && d.healthScore?.status !== filters.healthStatus)
          return false;
        if (filters.industry !== "all" && d.industry !== filters.industry) return false;
        if (filters.assignedTo !== "all" && d.assignedTo !== filters.assignedTo) return false;
        return true;
      })
      .sort((a, b) => {
        switch (filters.sortBy) {
          case "health":
            return (b.healthScore?.score ?? 0) - (a.healthScore?.score ?? 0);
          case "lastContact":
            return (
              differenceInDays(new Date(), new Date(a.lastContactDate)) -
              differenceInDays(new Date(), new Date(b.lastContactDate))
            );
          case "value":
            return b.dealValue - a.dealValue;
          case "close":
            return (
              new Date(a.expectedCloseDate).getTime() - new Date(b.expectedCloseDate).getTime()
            );
        }
      });
  }, [deals, filters]);

  return (
    <div className="space-y-4">
      <PipelineSummary deals={deals} />
      <PipelineFilters
        value={filters}
        onChange={setFilters}
        industries={industries}
        assignees={assignees}
        onRecalculate={() => {
          recalculateAll();
          void leadsQuery.refetch();
          toast.success("All deal scores recalculated.");
        }}
      />
      <PipelineBoard deals={filtered} />
    </div>
  );
}
