import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { fetchLeads } from "@/lib/crm/queries";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search } from "lucide-react";
import { STAGES, stageMeta, formatMoney, type CrmStage } from "@/lib/crm/types";
import { LeadFormDialog } from "@/components/crm/LeadFormDialog";
import { AssigneeFilter } from "@/components/crm/AssigneeFilter";
import { format } from "date-fns";
import { PaginationBar, usePagination } from "@/components/PageSizeSelect";

export const Route = createFileRoute("/_authenticated/crm/list")({
  component: ListPage,
});

function ListPage() {
  const { companyId, ready } = useAuth();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<CrmStage | "all">("all");
  const [assignee, setAssignee] = useState<string>("all");
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["crm-leads", companyId, stage, search, assignee],
    enabled: ready && !!companyId,
    queryFn: () => fetchLeads({
      companyId: companyId!,
      search: search || undefined,
      stage: stage === "all" ? null : stage,
      assignedTo: assignee === "all" ? null : assignee,
    }),
  });

  const pg = usePagination(data ?? [], 20);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">{(data ?? []).length} total</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="pl-9 w-56" />
          </div>
          <AssigneeFilter companyId={companyId} value={assignee} onChange={setAssignee} />
          <Select value={stage} onValueChange={(v) => setStage(v as any)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {STAGES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />New lead</Button>
        </div>
      </header>


      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Probability</TableHead>
              <TableHead>Close date</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>Last activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pg.paged.map((l) => {
              const meta = stageMeta(l.stage);
              return (
                <TableRow key={l.id} className="cursor-pointer">
                  <TableCell>
                    <Link to="/crm/$leadId" params={{ leadId: l.id }} className="font-medium hover:underline">
                      {l.customer_name}
                    </Link>
                    {l.company_name && <div className="text-xs text-muted-foreground">{l.company_name}</div>}
                  </TableCell>
                  <TableCell><Badge variant="outline" className={meta.badge}>{meta.label}</Badge></TableCell>
                  <TableCell>{formatMoney(l.expected_value, l.currency)}</TableCell>
                  <TableCell>{l.probability}%</TableCell>
                  <TableCell>{l.expected_close_date ? format(new Date(l.expected_close_date), "MMM d, yyyy") : "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.assignee?.full_name || l.assignee?.email || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{format(new Date(l.last_activity_at), "MMM d, p")}</TableCell>
                </TableRow>
              );
            })}
            {pg.paged.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">No leads.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <PaginationBar {...pg} label="leads" />
      <LeadFormDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
