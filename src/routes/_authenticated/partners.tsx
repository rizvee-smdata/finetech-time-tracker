import { createFileRoute } from "@tanstack/react-router";
import { ContactsManager } from "@/components/ContactsManager";

export const Route = createFileRoute("/_authenticated/partners")({
  component: () => (
    <ContactsManager
      kind="partner"
      title="Partners"
      subtitle="All partners for this company."
      singular="Partner"
      plural="Partners"
    />
  ),
});
