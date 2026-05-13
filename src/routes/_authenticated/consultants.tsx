import { createFileRoute } from "@tanstack/react-router";
import { ContactsManager } from "@/components/ContactsManager";

export const Route = createFileRoute("/_authenticated/consultants")({
  component: () => (
    <ContactsManager
      kind="consultant"
      title="Consultants"
      subtitle="All consultants for this company."
      singular="Consultant"
      plural="Consultants"
    />
  ),
});
