import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { toast } from "sonner";
import { ChevronsUpDown, ShieldAlert, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/account-review")({
  component: AccountReviewPage,
});

type Row = {
  source: "visit_checkin" | "customer_visit";
  id: string;
  company_id: string;
  rep_id: string | null;
  rep_name: string | null;
  original_name: string | null;
  visit_at: string;
};

function AccountReviewPage() {
  const { companyId, isStaff } = useAuth();
  const qc = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["account-review", companyId],
    enabled: !!companyId && isStaff,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("visits_needing_account_review")
        .select("*")
        .eq("company_id", companyId!)
        .order("visit_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const { data: summary } = useQuery({
    queryKey: ["account-review-summary", companyId],
    enabled: !!companyId && isStaff,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("visit_account_migration_summary")
        .select("*")
        .eq("company_id", companyId!)
        .maybeSingle();
      return data as { total_rows: number; auto_matched: number; needs_review: number } | null;
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["all-accounts", companyId],
    enabled: !!companyId && isStaff,
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, customer_name, kind")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("customer_name");
      const seen = new Set<string>();
      return (data ?? []).filter((c) => {
        const k = c.customer_name.trim().toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k); return true;
      });
    },
  });

  async function assign(row: Row, accountId: string) {
    const table = row.source === "visit_checkin" ? "visit_checkins" : "customer_visits";
    const { error } = await supabase.from(table).update({ account_id: accountId }).eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Linked to account");
    qc.invalidateQueries({ queryKey: ["account-review", companyId] });
    qc.invalidateQueries({ queryKey: ["account-review-summary", companyId] });
  }

  async function createAndAssign(row: Row) {
    const name = row.original_name?.trim();
    if (!name || !companyId) return;
    const { data, error } = await supabase
      .from("customers")
      .insert({ company_id: companyId, customer_name: name, kind: "customer" })
      .select("id").single();
    if (error) { toast.error(error.message); return; }
    await assign(row, data.id);
    qc.invalidateQueries({ queryKey: ["all-accounts", companyId] });
  }

  if (!isStaff) {
    return (
      <Card className="mx-auto mt-10 max-w-md p-6 text-center">
        <ShieldAlert className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm">Admin or manager role required.</p>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Visits needing account review</h1>
        <p className="text-sm text-muted-foreground">
          Historical visits whose free-text customer name couldn&apos;t be auto-matched. Pick the correct account or create one.
        </p>
      </div>

      {summary && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4"><div className="text-xs text-muted-foreground">Total visits</div><div className="text-2xl font-semibold">{summary.total_rows}</div></Card>
          <Card className="p-4"><div className="text-xs text-muted-foreground">Auto-matched</div><div className="text-2xl font-semibold text-emerald-600">{summary.auto_matched}</div></Card>
          <Card className="p-4"><div className="text-xs text-muted-foreground">Needs review</div><div className="text-2xl font-semibold text-warning">{summary.needs_review}</div></Card>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Original name</th>
                <th className="px-3 py-2">Rep</th>
                <th className="px-3 py-2">Visit date</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">All clear — every visit is linked to an account.</td></tr>
              ) : rows.map((r) => (
                <ReviewRow key={`${r.source}-${r.id}`} row={r} customers={customers} onAssign={assign} onCreate={createAndAssign} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ReviewRow({ row, customers, onAssign, onCreate }: {
  row: Row;
  customers: { id: string; customer_name: string; kind: string }[];
  onAssign: (r: Row, id: string) => void;
  onCreate: (r: Row) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const picked = useMemo(() => customers.find((c) => c.id === pickedId) ?? null, [customers, pickedId]);

  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2 font-medium">{row.original_name}</td>
      <td className="px-3 py-2">{row.rep_name ?? "—"}</td>
      <td className="px-3 py-2 tabular-nums">{format(new Date(row.visit_at), "PP")}</td>
      <td className="px-3 py-2"><Badge variant="outline">{row.source === "visit_checkin" ? "Check-in" : "Visit note"}</Badge></td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" role="combobox" className="min-w-[220px] justify-between font-normal">
                {picked ? picked.customer_name : "Pick account…"}
                <ChevronsUpDown className="ml-2 h-3 w-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search accounts…" />
                <CommandList>
                  <CommandEmpty>No matches.</CommandEmpty>
                  <CommandGroup>
                    {customers.map((c) => (
                      <CommandItem key={c.id} value={`${c.customer_name} ${c.kind}`} onSelect={() => { setPickedId(c.id); setOpen(false); }}>
                        <Check className={cn("mr-2 h-4 w-4", pickedId === c.id ? "opacity-100" : "opacity-0")} />
                        <span className="flex-1">{c.customer_name}</span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">{c.kind}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <Button size="sm" disabled={!pickedId} onClick={() => pickedId && onAssign(row, pickedId)}>Link</Button>
          <Button size="sm" variant="outline" onClick={() => onCreate(row)}>+ Create &amp; link</Button>
        </div>
      </td>
    </tr>
  );
}
