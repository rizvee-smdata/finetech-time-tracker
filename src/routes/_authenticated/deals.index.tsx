import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { differenceInDays } from "date-fns";
import { toast } from "sonner";
import { PipelineSummary } from "@/components/deals/PipelineSummary";
import { PipelineBoard } from "@/components/deals/PipelineBoard";
import {
  PipelineFilters,
  type PipelineFiltersValue,
} from "@/components/deals/PipelineFilters";
import { useDealsStore } from "@/lib/deals/storage";

export const Route = createFileRoute("/_authenticated/deals/")({
  component: PipelinePage,
});

function PipelinePage() {
  const { deals, recalculateAll } = useDealsStore();
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
        if (q && !`${d.title} ${d.clientName} ${d.clientCompany}`.toLowerCase().includes(q))
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
          toast.success("All deal scores recalculated.");
        }}
      />
      <PipelineBoard deals={filtered} />
    </div>
  );
}
