import { createFileRoute } from "@tanstack/react-router";
import { RevenueKPICards } from "@/components/time/RevenueKPICards";
import { HoursValueScatter } from "@/components/time/HoursValueScatter";
import { CategoryDonut } from "@/components/time/CategoryDonut";
import { BillableTrendLine } from "@/components/time/BillableTrendLine";
import { BudgetTracker } from "@/components/time/BudgetTracker";
import { WeeklyInsightCard } from "@/components/time/WeeklyInsightCard";
import { useTimeStore } from "@/lib/time/storage";
import { useDealsStore } from "@/lib/deals/storage";

export const Route = createFileRoute("/_authenticated/time/revenue")({
  component: RevenuePage,
});

function RevenuePage() {
  const { entries, budgets, target } = useTimeStore();
  const { deals } = useDealsStore();
  return (
    <div className="space-y-6">
      <RevenueKPICards entries={entries} deals={deals} />
      <div className="grid gap-4 lg:grid-cols-2">
        <HoursValueScatter entries={entries} deals={deals} />
        <CategoryDonut entries={entries} />
      </div>
      <BillableTrendLine entries={entries} target={target} />
      <BudgetTracker entries={entries} budgets={budgets} deals={deals} />
      <WeeklyInsightCard entries={entries} deals={deals} />
    </div>
  );
}
