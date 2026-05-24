import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MeetingForm, type MeetingFormValues } from "@/components/meetings/MeetingForm";
import { ProcessingState } from "@/components/meetings/ProcessingState";
import { ResultsView } from "@/components/meetings/ResultsView";
import { useMeetingsStore } from "@/lib/meetings/storage";
import { analyzeMeeting } from "@/lib/meetings/analyze.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/meetings/")({
  component: NewMeetingPage,
});

function NewMeetingPage() {
  const { addMeeting, setProcessed, meetings } = useMeetingsStore();
  const analyze = useServerFn(analyzeMeeting);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const current = activeId ? meetings.find((m) => m.id === activeId) ?? null : null;

  const handleAnalyze = async (values: MeetingFormValues) => {
    const meeting = addMeeting({
      title: values.title,
      clientName: values.clientName,
      clientCompany: values.clientCompany,
      date: values.date,
      attendees: values.attendees,
      rawNotes: values.rawNotes,
      status: "processing",
    });
    setActiveId(meeting.id);
    setProcessingId(meeting.id);
    try {
      const result = await analyze({
        data: {
          title: values.title,
          clientName: values.clientName,
          clientCompany: values.clientCompany,
          date: values.date,
          attendees: values.attendees,
          rawNotes: values.rawNotes,
        },
      });
      setProcessed(meeting.id, {
        ...result,
        actionItems: result.actionItems.map((a) => ({ ...a, id: "", done: false })),
        crmUpdates: result.crmUpdates.map((c) => ({ ...c, accepted: false })),
      });
      toast.success("Meeting analyzed");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to analyze meeting";
      toast.error(msg);
      // mark back to raw so user can retry
    } finally {
      setProcessingId(null);
    }
  };

  if (processingId) return <ProcessingState />;

  if (current && current.processed) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setActiveId(null);
            }}
          >
            New Meeting
          </Button>
        </div>
        <ResultsView meeting={current} />
      </div>
    );
  }

  return <MeetingForm onSubmit={handleAnalyze} />;
}
