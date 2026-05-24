import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { isSameDay } from "date-fns";
import { toast } from "sonner";
import { LiveTimer } from "@/components/time/LiveTimer";
import { EntryForm, type EntryFields } from "@/components/time/EntryForm";
import { TodayEntriesList } from "@/components/time/TodayEntriesList";
import { TodaySummaryBar } from "@/components/time/TodaySummaryBar";
import { ManualEntryDialog } from "@/components/time/ManualEntryDialog";
import { useTimeStore } from "@/lib/time/storage";
import { useDealsStore } from "@/lib/deals/storage";

export const Route = createFileRoute("/_authenticated/time/")({
  component: TrackerPage,
});

function TrackerPage() {
  const { entries, timer, target, stopAndSave, deleteEntry, updateTimerFields } = useTimeStore();
  const { deals } = useDealsStore();
  const [fields, setFields] = useState<EntryFields>({
    description: "", category: "Pre-Sales", billable: true, dealId: undefined, tags: [],
  });

  // Hydrate from running timer
  useEffect(() => {
    if (timer && timer.currentDescription && !fields.description) {
      setFields({
        description: timer.currentDescription,
        category: timer.category ?? "Pre-Sales",
        billable: timer.billable ?? true,
        dealId: timer.dealId,
        tags: timer.tags ?? [],
      });
    }
  }, [timer]);

  // Push field edits into running timer
  useEffect(() => {
    if (timer) {
      updateTimerFields({
        currentDescription: fields.description,
        category: fields.category,
        billable: fields.billable,
        dealId: fields.dealId,
        tags: fields.tags,
      });
    }
  }, [fields]);

  const todayEntries = useMemo(() => entries.filter((e) => isSameDay(new Date(e.startTime), new Date())), [entries]);

  function handleStop() {
    const deal = fields.dealId ? deals.find((d) => d.id === fields.dealId) : undefined;
    const saved = stopAndSave({
      category: fields.category, billable: fields.billable,
      dealId: fields.dealId, clientName: deal?.clientName, clientCompany: deal?.clientCompany,
      tags: fields.tags,
    });
    if (saved) {
      toast.success(`Saved ${saved.duration}m`);
      setFields({ description: "", category: "Pre-Sales", billable: true, dealId: undefined, tags: [] });
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 via-violet-900/10 to-transparent p-6">
        <LiveTimer description={fields.description} onStop={handleStop} />
        <div className="mt-6">
          <EntryForm values={fields} onChange={setFields} />
        </div>
      </div>

      <TodaySummaryBar entries={todayEntries} target={target} />

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Today's entries</h2>
        <ManualEntryDialog />
      </div>
      <TodayEntriesList entries={todayEntries} onDelete={(id) => { deleteEntry(id); toast.success("Deleted"); }} />
    </div>
  );
}
