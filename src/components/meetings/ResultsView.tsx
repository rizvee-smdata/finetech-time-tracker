import type { Meeting } from "@/lib/meetings/types";
import { SummaryCard } from "./SummaryCard";
import { ActionItemsTable } from "./ActionItemsTable";
import { IntelligencePanels } from "./IntelligencePanels";
import { CRMUpdatesList } from "./CRMUpdatesList";
import { FollowUpEmail } from "./FollowUpEmail";
import { MeetingIntegrationBar } from "./MeetingIntegrationBar";

export function ResultsView({ meeting }: { meeting: Meeting }) {
  if (!meeting.processed) return null;
  return (
    <div className="space-y-5">
      <MeetingIntegrationBar meeting={meeting} />
      <SummaryCard meeting={meeting} />
      <ActionItemsTable meeting={meeting} />
      <IntelligencePanels meeting={meeting} />
      <CRMUpdatesList meeting={meeting} />
      <FollowUpEmail meeting={meeting} />
    </div>
  );
}

