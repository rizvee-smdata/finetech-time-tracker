import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { fetchLeads } from "@/lib/crm/queries";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { LeadFormDialog } from "@/components/crm/LeadFormDialog";
import { AssigneeFilter } from "@/components/crm/AssigneeFilter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/crm/pipeline")({
  component: PipelinePage,
});

function PipelinePage() {
  const { companyId, ready } = useAuth();
  const [search, setSearch] = useState("");
  const [assignee, setAssignee] = useState<string>("all");
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["crm-leads", companyId, search, assignee],
    enabled: ready && !!companyId,
    queryFn: () => fetchLeads({
      companyId: companyId!,
      search: search || undefined,
      assignedTo: assignee === "all" ? null : assignee,
    }),
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">CRM Pipeline</h1>
          <p className="text-sm text-muted-foreground">Drag cards between stages to update.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search leads…" className="pl-9 w-64" />
          </div>
          <AssigneeFilter companyId={companyId} value={assignee} onChange={setAssignee} />
          <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />New lead</Button>
        </div>
      </header>

      <KanbanBoard leads={data ?? []} />
      <LeadFormDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

