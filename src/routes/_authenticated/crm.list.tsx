import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { fetchLeads, fetchCompanyMembers } from "@/lib/crm/queries";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Download, UserCog, ArrowRightLeft, Upload, Trash2 } from "lucide-react";
import { STAGES, stageMeta, formatMoney, type CrmStage, type Lead } from "@/lib/crm/types";
import { LeadFormDialog } from "@/components/crm/LeadFormDialog";
import { ImportLeadsDialog } from "@/components/crm/ImportLeadsDialog";
import { SavedViewsMenu, type SavedFilters } from "@/components/crm/SavedViewsMenu";
import { AssigneeFilter } from "@/components/crm/AssigneeFilter";
import { format } from "date-fns";
import { PaginationBar, usePagination } from "@/components/PageSizeSelect";
import { toast } from "sonner";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/crm/list")({
  component: ListPage,
});

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportLeadsCsv(leads: Lead[]) {
  const headers = ["Customer", "Company", "Contact", "Phone", "Email", "Stage", "Priority", "Source", "Value", "Currency", "Probability", "Expected close", "Assignee", "Created", "Last activity"];
  const rows = leads.map((l) => [
    l.customer_name, l.company_name ?? "", l.contact_person ?? "", l.phone ?? "", l.email ?? "",
    l.stage, l.priority, l.lead_source, l.expected_value ?? "", l.currency,
    `${l.probability}%`, l.expected_close_date ?? "",
    l.assignee?.full_name ?? l.assignee?.email ?? "",
    format(new Date(l.created_at), "yyyy-MM-dd"),
    format(new Date(l.last_activity_at), "yyyy-MM-dd HH:mm"),
  ]);
  const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `crm-leads-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ListPage() {
  const { companyId, ready } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState("");
  const [stage, setStage] = useState<CrmStage | "all">("all");
  const [assignee, setAssignee] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAssignee, setBulkAssignee] = useState<string>("");
  const [bulkStage, setBulkStage] = useState<CrmStage | "">("");

  const { data } = useQuery({
    queryKey: ["crm-leads", companyId, stage, search, company, assignee, dateFrom, dateTo],
    enabled: ready && !!companyId,
    queryFn: () => fetchLeads({
      companyId: companyId!,
      search: search || undefined,
      company: company || undefined,
      stage: stage === "all" ? null : stage,
      assignedTo: assignee === "all" ? null : assignee,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
  });

  const members = useQuery({
    queryKey: ["crm-members", companyId],
    enabled: ready && !!companyId,
    queryFn: () => fetchCompanyMembers(companyId!),
  });

  const pg = usePagination(data ?? [], 20);
  const leads = data ?? [];
  const allOnPageSelected = pg.paged.length > 0 && pg.paged.every((l) => selected.has(l.id));

  const toggleAll = () => {
    const next = new Set(selected);
    if (allOnPageSelected) pg.paged.forEach((l) => next.delete(l.id));
    else pg.paged.forEach((l) => next.add(l.id));
    setSelected(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const clearSelection = () => setSelected(new Set());

  const reassign = useMutation({
    mutationFn: async (userId: string) => {
      const ids = Array.from(selected);
      const { error } = await sb.from("crm_leads").update({ assigned_to: userId || null }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Reassigned ${selected.size} lead${selected.size > 1 ? "s" : ""}`);
      clearSelection();
      setBulkAssignee("");
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const changeStage = useMutation({
    mutationFn: async (newStage: CrmStage) => {
      const ids = Array.from(selected);
      const { error } = await sb.from("crm_leads").update({ stage: newStage }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Updated ${selected.size} lead${selected.size > 1 ? "s" : ""}`);
      clearSelection();
      setBulkStage("");
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const bulkDelete = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      const { error } = await sb.from("crm_leads").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Deleted ${selected.size} lead${selected.size > 1 ? "s" : ""}`);
      clearSelection();
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const selectedLeads = useMemo(() => leads.filter((l) => selected.has(l.id)), [leads, selected]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">{leads.length} total</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="pl-9 w-48" />
          </div>
          <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company…" className="w-36" />
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[150px]" title="Created from" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[150px]" title="Created to" />
          <AssigneeFilter companyId={companyId} value={assignee} onChange={setAssignee} />
          <Select value={stage} onValueChange={(v) => setStage(v as any)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {STAGES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <SavedViewsMenu
            currentFilters={{ search, company, stage, assignee, dateFrom, dateTo } as SavedFilters}
            onApply={(f: any) => {
              setSearch(f.search ?? "");
              setCompany(f.company ?? "");
              setStage(f.stage ?? "all");
              setAssignee(f.assignee ?? "all");
              setDateFrom(f.dateFrom ?? "");
              setDateTo(f.dateTo ?? "");
            }}
          />
          <Button variant="outline" onClick={() => exportLeadsCsv(leads)} disabled={leads.length === 0}>
            <Download className="mr-2 h-4 w-4" />Export CSV
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />Import CSV
          </Button>
          <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />New lead</Button>
        </div>
      </header>

      {selected.size > 0 && (
        <Card className="p-3 flex flex-wrap items-center gap-2 bg-muted/40">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <span className="text-sm text-muted-foreground">· {formatMoney(selectedLeads.reduce((s, l) => s + (l.expected_value ?? 0), 0))}</span>
          <div className="flex items-center gap-1 ml-auto">
            <UserCog className="h-4 w-4 text-muted-foreground" />
            <Select value={bulkAssignee} onValueChange={(v) => { setBulkAssignee(v); reassign.mutate(v === "__none__" ? "" : v); }}>
              <SelectTrigger className="w-[200px] h-9"><SelectValue placeholder="Reassign to…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Unassigned</SelectItem>
                {(members.data ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
            <Select value={bulkStage} onValueChange={(v) => { setBulkStage(v as CrmStage); changeStage.mutate(v as CrmStage); }}>
              <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Move to stage…" /></SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              if (confirm(`Delete ${selected.size} lead${selected.size > 1 ? "s" : ""}? This cannot be undone.`)) {
                bulkDelete.mutate();
              }
            }}
          >
            <Trash2 className="h-4 w-4 mr-1" />Delete
          </Button>
          <Button variant="ghost" size="sm" onClick={clearSelection}>Clear</Button>
        </Card>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox checked={allOnPageSelected} onCheckedChange={toggleAll} aria-label="Select all on page" />
              </TableHead>
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
                <TableRow key={l.id} data-state={selected.has(l.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox checked={selected.has(l.id)} onCheckedChange={() => toggleOne(l.id)} aria-label="Select row" />
                  </TableCell>
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
              <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">No leads.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <PaginationBar {...pg} label="leads" />
      <LeadFormDialog open={open} onOpenChange={setOpen} />
      <ImportLeadsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => qc.invalidateQueries({ queryKey: ["crm-leads"] })}
      />
    </div>
  );
}
