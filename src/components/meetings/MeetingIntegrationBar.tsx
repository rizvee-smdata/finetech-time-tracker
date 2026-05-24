import { useMemo, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { Link2, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDealsStore } from "@/lib/deals/storage";
import type { Meeting } from "@/lib/meetings/types";
import { linkMeetingToDeal } from "@/lib/app/integrations";

export function MeetingIntegrationBar({ meeting }: { meeting: Meeting }) {
  const router = useRouter();
  const { deals } = useDealsStore();
  const [selected, setSelected] = useState<string>("");

  const openDeals = useMemo(
    () => deals.filter((d) => d.stage !== "Closed Won" && d.stage !== "Closed Lost"),
    [deals],
  );

  const onLink = (dealId: string) => {
    setSelected(dealId);
    const result = linkMeetingToDeal(meeting, dealId);
    if (!result) {
      toast.error("Deal not found");
      return;
    }
    const emoji =
      result.deal.healthScore?.status === "healthy"
        ? "🟢"
        : result.deal.healthScore?.status === "at_risk"
          ? "🟡"
          : "🔴";
    toast.success(
      `Deal health updated: ${result.deal.clientCompany} ${result.prevScore} → ${result.newScore} ${emoji}`,
    );
  };

  return (
    <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 backdrop-blur">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Link2 className="h-4 w-4 text-blue-400" /> Connect this meeting
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={selected} onValueChange={onLink}>
          <SelectTrigger className="h-9 w-[260px]">
            <SelectValue placeholder="Link to deal & update health…" />
          </SelectTrigger>
          <SelectContent>
            {openDeals.length === 0 ? (
              <SelectItem value="_none" disabled>
                No open deals
              </SelectItem>
            ) : (
              openDeals.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.clientCompany} — {d.title}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="bg-emerald-500 hover:bg-emerald-600"
          onClick={() =>
            router.navigate({
              to: "/proposals/new",
              search: { fromMeeting: meeting.id } as never,
            })
          }
        >
          <FileText className="mr-1 h-3.5 w-3.5" /> Start Proposal from This Meeting
        </Button>
      </div>
    </div>
  );
}
