import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Mail, MessageCircle, History as HistoryIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/followups/history")({
  component: HistoryPage,
});

const OUTCOMES = [
  { value: "reply_received", label: "Reply Received" },
  { value: "meeting_booked", label: "Meeting Booked" },
  { value: "no_response", label: "No Response" },
  { value: "deal_progressed", label: "Deal Progressed" },
];

function HistoryPage() {
  const { user, isStaff } = useAuth();
  const qc = useQueryClient();

  const { data: sends = [], isLoading } = useQuery({
    queryKey: ["followup-sends", user?.id, isStaff],
    enabled: !!user?.id,
    queryFn: async () => {
      let q = supabase.from("followup_sends").select("*, profiles:rep_id(full_name)" as any).order("sent_at", { ascending: false });
      if (!isStaff) q = q.eq("rep_id", user!.id);
      const { data } = await q;
      return (data ?? []) as any[];
    },
  });

  const setOutcome = useMutation({
    mutationFn: async ({ id, outcome }: { id: string; outcome: string }) => {
      const { error } = await supabase.from("followup_sends").update({
        outcome: outcome as any, outcome_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Outcome saved"); qc.invalidateQueries({ queryKey: ["followup-sends"] }); },
  });

  return (
    <div className="container mx-auto py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <HistoryIcon className="h-6 w-6 text-primary" /> Sent Follow-ups
        </h1>
        <p className="text-muted-foreground text-sm">Track outcomes for what you've sent.</p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Channel</TableHead>
              {isStaff && <TableHead>Rep</TableHead>}
              <TableHead>Message</TableHead>
              <TableHead>Outcome</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && sends.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No sends yet.</TableCell></TableRow>
            )}
            {sends.map((s: any) => (
              <TableRow key={s.id}>
                <TableCell>
                  <div className="font-medium">{s.contact_name}</div>
                  <div className="text-xs text-muted-foreground">{s.company_name}</div>
                </TableCell>
                <TableCell className="text-sm">{new Date(s.sent_at).toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="gap-1">
                    {s.channel === "whatsapp" ? <MessageCircle className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                    {s.channel}
                  </Badge>
                </TableCell>
                {isStaff && <TableCell className="text-sm">{s.profiles?.full_name ?? "—"}</TableCell>}
                <TableCell className="max-w-xs truncate text-sm" title={s.message}>{s.message}</TableCell>
                <TableCell>
                  <Select value={s.outcome ?? ""} onValueChange={(v) => setOutcome.mutate({ id: s.id, outcome: v })}>
                    <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Mark outcome" /></SelectTrigger>
                    <SelectContent>
                      {OUTCOMES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
