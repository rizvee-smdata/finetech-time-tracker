import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Flag, Sparkles, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { flagRepForCoaching, ragForScore, type CoachingInsight } from "@/lib/coaching";

export const Route = createFileRoute("/_authenticated/coach/team")({
  component: CoachTeamPage,
});

function CoachTeamPage() {
  const { companyId, isStaff } = useAuth();
  const qc = useQueryClient();

  const { data: members = [] } = useQuery({
    queryKey: ["company-members", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("company_members")
        .select("user_id")
        .eq("company_id", companyId!);
      const ids = (data ?? []).map((m: any) => m.user_id);
      if (!ids.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      return profiles ?? [];
    },
  });

  const { data: insights = [] } = useQuery({
    queryKey: ["team-coaching-insights", companyId],
    enabled: !!companyId && isStaff,
    queryFn: async () => {
      const { data } = await supabase
        .from("coaching_insights" as never)
        .select("*")
        .eq("company_id", companyId!)
        .order("week_start", { ascending: false });
      return (data ?? []) as CoachingInsight[];
    },
  });

  // latest per rep
  const latestByRep = useMemo(() => {
    const map = new Map<string, CoachingInsight>();
    for (const i of insights) if (!map.has(i.user_id)) map.set(i.user_id, i);
    return map;
  }, [insights]);

  if (!isStaff) {
    return (
      <Card className="m-6 p-8 text-center">
        <ShieldAlert className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p>Manager access required.</p>
      </Card>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" /> Team Coaching Overview
        </h1>
        <p className="text-muted-foreground text-sm">Latest AI engagement score and gaps per rep.</p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rep</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Top Strength</TableHead>
              <TableHead>Top Gap</TableHead>
              <TableHead>Last Active</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No team members.</TableCell></TableRow>
            )}
            {members.map((m: any) => {
              const ins = latestByRep.get(m.id);
              return <RepRow key={m.id} rep={m} insight={ins} onFlagged={() => qc.invalidateQueries({ queryKey: ["team-coaching-insights"] })} companyId={companyId!} />;
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function RepRow({
  rep, insight, companyId, onFlagged,
}: { rep: any; insight?: CoachingInsight; companyId: string; onFlagged: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [when, setWhen] = useState("");

  const rag = ragForScore(insight?.engagement_score ?? null);
  const ragColor = rag === "green" ? "bg-green-500/15 text-green-700"
    : rag === "amber" ? "bg-amber-500/15 text-amber-700"
    : rag === "red" ? "bg-red-500/15 text-red-700"
    : "bg-muted text-muted-foreground";

  const flag = useMutation({
    mutationFn: () => flagRepForCoaching({
      companyId, repId: rep.id, reason: reason || undefined,
      scheduledAt: when ? new Date(when).toISOString() : null,
      insightId: insight?.id,
    }),
    onSuccess: () => {
      toast.success(`Flagged ${rep.full_name ?? rep.email} for 1:1`);
      setOpen(false); setReason(""); setWhen("");
      onFlagged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to flag"),
  });

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{rep.full_name ?? "—"}</div>
        <div className="text-xs text-muted-foreground">{rep.email}</div>
      </TableCell>
      <TableCell>
        {insight?.engagement_score != null ? (
          <Badge className={ragColor}>{insight.engagement_score}/10</Badge>
        ) : <span className="text-muted-foreground text-sm">—</span>}
      </TableCell>
      <TableCell className="max-w-xs truncate text-sm" title={insight?.strength ?? ""}>{insight?.strength ?? "—"}</TableCell>
      <TableCell className="max-w-xs truncate text-sm" title={insight?.focus_area ?? ""}>{insight?.focus_area ?? "—"}</TableCell>
      <TableCell className="text-sm">
        {insight ? new Date(insight.generated_at).toLocaleDateString() : "—"}
      </TableCell>
      <TableCell className="text-right">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline"><Flag className="h-3.5 w-3.5 mr-1.5" />Flag 1:1</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule 1:1 with {rep.full_name ?? rep.email}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="when">When</Label>
                <Input id="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="reason">Reason / focus</Label>
                <Textarea id="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder={insight?.focus_area ?? "What do you want to discuss?"} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => flag.mutate()} disabled={flag.isPending}>
                {flag.isPending ? "Saving…" : "Create 1:1"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  );
}
