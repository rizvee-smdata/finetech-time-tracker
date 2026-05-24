import { createFileRoute } from "@tanstack/react-router";
import { WinLossInsights } from "@/components/deals/WinLossInsights";

export const Route = createFileRoute("/_authenticated/deals/insights")({
  component: InsightsPage,
});

function InsightsPage() {
  return <WinLossInsights />;
}
