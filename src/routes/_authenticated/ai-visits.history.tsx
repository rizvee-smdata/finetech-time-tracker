import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Plus } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/ai-visits/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const { companyId, isStaff } = useAuth();
  const [clientFilter, setClientFilter] = useState<string>("");
  const [repFilter, setRepFilter] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["ai-visit-reports", companyId, clientFilter, repFilter, fromDate, toDate],
    enabled: !!companyId,
    queryFn: async () => {
      let q = supabase
        .from("ai_visit_reports")
        .select("id, client_name, visit_date, user_id, ai_generated, tasks_created_count, created_at, account_id")
        .eq("company_id", companyId!)
        .order("visit_date", { ascending: false })
        .limit(200);
      if (clientFilter) q = q.ilike("client_name", `%${clientFilter}%`);
      if (repFilter) q = q.eq("user_id", repFilter);
      if (fromDate) q = q.gte("visit_date", fromDate);
      if (toDate) q = q.lte("visit_date", toDate);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: reps = [] } = useQuery({
    queryKey: ["company-reps", companyId],
    enabled: !!companyId && isStaff,
    queryFn: async () => {
      const { data } = await supabase
        .from("company_members")
        .select("user_id, profiles:user_id(full_name, email)")
        .eq("company_id", companyId!);
      return (data ?? []) as Array<{ user_id: string; profiles: { full_name: string | null; email: string | null } | null }>;
    },
  });

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Visit Report History</h1>
          <p className="text-sm text-muted-foreground">All saved AI-generated and manual visit reports.</p>
        </div>
        <Button asChild>
          <Link to="/ai-visits/new"><Plus className="h-4 w-4 mr-1" /> New Report</Link>
        </Button>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label>Client name</Label>
            <Input value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} placeholder="Filter…" />
          </div>
          {isStaff && (
            <div className="space-y-1.5">
              <Label>Rep</Label>
              <Select value={repFilter} onValueChange={(v) => setRepFilter(v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="All reps" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All reps</SelectItem>
                  {reps.map((r) => (
                    <SelectItem key={r.user_id} value={r.user_id}>
                      {r.profiles?.full_name ?? r.profiles?.email ?? r.user_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-3">Client</th>
              <th className="p-3">Visit Date</th>
              <th className="p-3">Tasks</th>
              <th className="p-3">AI</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!isLoading && reports.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No reports yet.</td></tr>
            )}
            {reports.map((r) => (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                <td className="p-3 font-medium">{r.client_name}</td>
                <td className="p-3">{format(new Date(r.visit_date), "PP")}</td>
                <td className="p-3">
                  {r.tasks_created_count > 0 ? (
                    <Badge variant="secondary">{r.tasks_created_count}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="p-3">
                  {r.ai_generated && (
                    <Badge variant="outline" className="gap-1">
                      <Sparkles className="h-3 w-3 text-primary" /> AI
                    </Badge>
                  )}
                </td>
                <td className="p-3 text-right">
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/ai-visits/$id" params={{ id: r.id }}>Open</Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
