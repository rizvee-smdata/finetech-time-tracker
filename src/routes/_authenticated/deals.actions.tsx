import { createFileRoute } from "@tanstack/react-router";
import { ActionCenterList } from "@/components/deals/ActionCenterList";

export const Route = createFileRoute("/_authenticated/deals/actions")({
  component: ActionsPage,
});

function ActionsPage() {
  return <ActionCenterList />;
}
