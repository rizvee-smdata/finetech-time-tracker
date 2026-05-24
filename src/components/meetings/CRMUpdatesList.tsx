import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useMeetingsStore } from "@/lib/meetings/storage";
import { toast } from "sonner";
import type { Meeting } from "@/lib/meetings/types";

export function CRMUpdatesList({ meeting }: { meeting: Meeting }) {
  const { toggleCrmUpdate } = useMeetingsStore();
  const p = meeting.processed!;
  const accepted = p.crmUpdates.filter((c) => c.accepted).length;

  return (
    <Card className="border-border/60 bg-card/60 backdrop-blur">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">CRM Update Suggestions</h3>
            <Badge variant="secondary">{accepted}/{p.crmUpdates.length} accepted</Badge>
          </div>
        </div>
        <div className="divide-y divide-border/40 rounded-md border border-border/50">
          {p.crmUpdates.map((c, i) => (
            <div key={i} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{c.field}</div>
                <div className="text-sm font-medium">{c.suggestedValue}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${c.accepted ? "text-emerald-400" : "text-muted-foreground"}`}>
                  {c.accepted ? "Accepted" : "Reject"}
                </span>
                <Switch checked={c.accepted} onCheckedChange={() => toggleCrmUpdate(meeting.id, i)} />
              </div>
            </div>
          ))}
          {p.crmUpdates.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">No CRM updates suggested.</div>
          )}
        </div>
        <div className="flex justify-end">
          <Button
            disabled={accepted === 0}
            className="bg-blue-500 text-white hover:bg-blue-400"
            onClick={() => toast.success(`Applied ${accepted} CRM updates`)}
          >
            Apply {accepted} Accepted Update{accepted === 1 ? "" : "s"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
