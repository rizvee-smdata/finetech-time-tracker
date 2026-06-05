import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Plus, Trash2, Power, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  createScheduledReport, deleteScheduledReport, listScheduledReports, toggleScheduledReport,
} from "@/lib/copilot/api";

export const Route = createFileRoute("/_authenticated/copilot/scheduled")({
  component: ScheduledPage,
});

function ScheduledPage() {
  const { user, companyId } = useAuth();
  const qc = useQueryClient();
  const [question, setQuestion] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [delivery, setDelivery] = useState<"in_app" | "whatsapp" | "email">("in_app");

  const { data: reports } = useQuery({
    queryKey: ["copilot-scheduled", user?.id],
    enabled: !!user?.id,
    queryFn: () => listScheduledReports(user!.id),
  });

  const handleCreate = async () => {
    if (!user || !companyId || !question.trim()) return;
    try {
      await createScheduledReport({
        company_id: companyId, user_id: user.id, question: question.trim(),
        frequency, delivery_method: delivery,
      });
      setQuestion("");
      await qc.invalidateQueries({ queryKey: ["copilot-scheduled", user.id] });
      toast.success("Scheduled report saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    }
  };

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/copilot"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <Calendar className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Scheduled Reports</h1>
      </div>

      <Card className="p-4 space-y-3">
        <h2 className="font-medium text-sm">New scheduled report</h2>
        <Textarea placeholder="e.g. Summarize this week's pipeline coverage and top stalled deals"
          value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} />
        <div className="grid sm:grid-cols-3 gap-2">
          <Select value={frequency} onValueChange={(v: any) => setFrequency(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
          <Select value={delivery} onValueChange={(v: any) => setDelivery(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="in_app">In-app reminder</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="email">Email</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleCreate} disabled={!question.trim()}>
            <Plus className="h-4 w-4 mr-1" /> Schedule
          </Button>
        </div>
      </Card>

      <div className="space-y-2">
        {(reports ?? []).length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No scheduled reports yet.
          </Card>
        )}
        {(reports ?? []).map((r) => (
          <Card key={r.id} className="p-3 space-y-2">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <div className="text-sm font-medium">{r.question}</div>
                <div className="text-xs text-muted-foreground mt-0.5 flex gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">{r.frequency}</Badge>
                  <Badge variant="outline" className="text-[10px]">{r.delivery_method.replace("_", " ")}</Badge>
                  {r.last_run_at && <span>Last run: {new Date(r.last_run_at).toLocaleString()}</span>}
                  {!r.active && <Badge variant="secondary" className="text-[10px]">paused</Badge>}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={async () => {
                await toggleScheduledReport(r.id, !r.active);
                await qc.invalidateQueries({ queryKey: ["copilot-scheduled", user?.id] });
              }}>
                <Power className={r.active ? "h-4 w-4" : "h-4 w-4 text-muted-foreground"} />
              </Button>
              <Button variant="ghost" size="icon" onClick={async () => {
                if (!confirm("Delete?")) return;
                await deleteScheduledReport(r.id);
                await qc.invalidateQueries({ queryKey: ["copilot-scheduled", user?.id] });
              }}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            {r.last_result?.answer && (
              <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2 line-clamp-4 whitespace-pre-wrap">
                {r.last_result.answer}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
