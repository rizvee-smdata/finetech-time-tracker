import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { Check, X, Receipt, AlertTriangle } from "lucide-react";
import { formatBDT, slaInfo, initialsOf } from "@/lib/manager/helpers";

export const Route = createFileRoute("/_authenticated/manager/approvals/expenses")({
  component: ExpenseApprovalsPage,
});

function ExpenseApprovalsPage() {
  const { companyId, user } = useAuth();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bulk, setBulk] = useState<Set<string>>(new Set());
  const [rejectComment, setRejectComment] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // filters
  const [repFilter, setRepFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [minAmt, setMinAmt] = useState<string>("");
  const [maxAmt, setMaxAmt] = useState<string>("");

  const list = useQuery({
    queryKey: ["mgr-expenses", companyId, repFilter, categoryFilter, dateFrom, dateTo, minAmt, maxAmt],
    enabled: !!companyId,
    queryFn: async () => {
      let q = supabase
        .from("expenses")
        .select("id, user_id, expense_date, category_name, amount, description, receipt_path, submitted_at, status, profiles:user_id(full_name)")
        .eq("company_id", companyId!)
        .eq("status", "submitted")
        .order("submitted_at", { ascending: true, nullsFirst: false });
      if (repFilter !== "all") q = q.eq("user_id", repFilter);
      if (categoryFilter !== "all") q = q.eq("category_name", categoryFilter);
      if (dateFrom) q = q.gte("expense_date", dateFrom);
      if (dateTo) q = q.lte("expense_date", dateTo);
      if (minAmt) q = q.gte("amount", Number(minAmt));
      if (maxAmt) q = q.lte("amount", Number(maxAmt));
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const reps = useMemo(() => {
    const map = new Map<string, string>();
    (list.data ?? []).forEach((r: any) => {
      if (r.user_id) map.set(r.user_id, r.profiles?.full_name ?? "Rep");
    });
    return Array.from(map.entries());
  }, [list.data]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    (list.data ?? []).forEach((r: any) => r.category_name && set.add(r.category_name));
    return Array.from(set);
  }, [list.data]);

  useEffect(() => {
    if (!companyId) return;
    const ch = supabase
      .channel(`mgr-exp-${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, () => {
        qc.invalidateQueries({ queryKey: ["mgr-expenses"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId, qc]);

  const selected = (list.data ?? []).find((e: any) => e.id === selectedId);

  // resolve receipt URL
  const receipt = useQuery({
    queryKey: ["mgr-exp-receipt", selected?.receipt_path],
    enabled: !!selected?.receipt_path,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("expense-receipts")
        .createSignedUrl(selected!.receipt_path as string, 300);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  const decide = useMutation({
    mutationFn: async ({ ids, action, comment }: { ids: string[]; action: "approved" | "rejected"; comment?: string }) => {
      const updates: any = {
        status: action,
        reviewed_by: user!.id,
        reviewed_at: new Date().toISOString(),
        reviewer_comment: comment ?? null,
        rejection_reason: action === "rejected" ? (comment ?? null) : null,
      };
      const { error } = await supabase.from("expenses").update(updates).in("id", ids);
      if (error) throw error;
      // approval logs
      const logs = ids.map((id) => ({
        company_id: companyId!,
        entity_type: "expense",
        entity_id: id,
        action,
        actor_id: user!.id,
        comments: comment ?? null,
      }));
      await supabase.from("approval_logs").insert(logs);
    },
    onSuccess: (_d, vars) => {
      toast.success(`${vars.ids.length} expense(s) ${vars.action}`);
      setBulk(new Set());
      setSelectedId(null);
      setRejectComment("");
      qc.invalidateQueries({ queryKey: ["mgr-expenses"] });
      qc.invalidateQueries({ queryKey: ["manager-kpis"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <div className="grid h-[calc(100vh-7rem)] grid-cols-1 lg:grid-cols-[1fr_1.2fr]">
      {/* Left: list */}
      <div className="flex flex-col border-r border-border">
        <div className="space-y-2 border-b border-border bg-card/40 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">Pending Expenses</h2>
              <Badge variant="secondary">{list.data?.length ?? 0}</Badge>
            </div>
            {bulk.size > 0 && (
              <Button
                size="sm"
                onClick={() => decide.mutate({ ids: Array.from(bulk), action: "approved" })}
                disabled={decide.isPending}
              >
                <Check className="mr-1 h-4 w-4" /> Approve {bulk.size}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <Select value={repFilter} onValueChange={setRepFilter}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Rep" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All reps</SelectItem>
                {reps.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex gap-1">
              <Input type="number" placeholder="Min ৳" className="h-8" value={minAmt} onChange={(e) => setMinAmt(e.target.value)} />
              <Input type="number" placeholder="Max ৳" className="h-8" value={maxAmt} onChange={(e) => setMaxAmt(e.target.value)} />
            </div>
            <Input type="date" className="h-8" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <Input type="date" className="h-8" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {list.isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : (list.data ?? []).length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No pending expenses</div>
          ) : (
            <ul className="space-y-2">
              {list.data!.map((e: any) => {
                const sla = slaInfo(e.submitted_at);
                const active = selectedId === e.id;
                return (
                  <li key={e.id}>
                    <button
                      onClick={() => setSelectedId(e.id)}
                      className={`w-full rounded-md border p-3 text-left transition ${
                        active ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div onClick={(ev) => ev.stopPropagation()} className="pt-1">
                          <Checkbox
                            checked={bulk.has(e.id)}
                            onCheckedChange={(v) => {
                              const n = new Set(bulk);
                              if (v) n.add(e.id); else n.delete(e.id);
                              setBulk(n);
                            }}
                          />
                        </div>
                        <Avatar className="h-9 w-9">
                          <AvatarFallback>{initialsOf(e.profiles?.full_name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="truncate font-medium">{e.profiles?.full_name ?? "Rep"}</div>
                            <div className="shrink-0 font-bold">{formatBDT(Number(e.amount))}</div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {e.category_name} • {format(new Date(e.expense_date), "MMM d")}
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <Badge variant={sla.breached ? "destructive" : "outline"} className="text-[10px]">
                              {sla.breached && <AlertTriangle className="mr-1 h-3 w-3" />}
                              {sla.label}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Right: detail */}
      <div className="overflow-y-auto p-4 md:p-6">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select an expense to review
          </div>
        ) : (
          <Card className="p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Expense</div>
                <div className="text-2xl font-bold">{formatBDT(Number(selected.amount))}</div>
                <div className="text-sm text-muted-foreground">
                  {selected.category_name} • {format(new Date(selected.expense_date), "PPP")}
                </div>
              </div>
              <Badge variant={slaInfo(selected.submitted_at).breached ? "destructive" : "secondary"}>
                Pending • {slaInfo(selected.submitted_at).label}
              </Badge>
            </div>

            <div className="mb-4 flex items-center gap-3">
              <Avatar><AvatarFallback>{initialsOf((selected as any).profiles?.full_name)}</AvatarFallback></Avatar>
              <div>
                <div className="font-medium">{(selected as any).profiles?.full_name ?? "Rep"}</div>
                <div className="text-xs text-muted-foreground">
                  Submitted {selected.submitted_at ? format(new Date(selected.submitted_at), "PPp") : "—"}
                </div>
              </div>
            </div>

            {selected.description && (
              <div className="mb-4">
                <div className="text-xs font-medium text-muted-foreground">Description</div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{selected.description}</p>
              </div>
            )}

            <div className="mb-4">
              <div className="mb-2 text-xs font-medium text-muted-foreground">Receipt</div>
              {selected.receipt_path ? (
                receipt.data ? (
                  <button
                    onClick={() => setPreviewUrl(receipt.data!)}
                    className="overflow-hidden rounded-md border"
                  >
                    <img src={receipt.data} alt="Receipt" className="max-h-48 object-contain" />
                  </button>
                ) : <Skeleton className="h-32 w-48" />
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Receipt className="h-4 w-4" /> No receipt attached
                </div>
              )}
            </div>

            <div className="mb-4">
              <Textarea
                placeholder="Comment (required for rejection)…"
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex gap-2">
              <Button
                size="lg"
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => decide.mutate({ ids: [selected.id], action: "approved", comment: rejectComment || undefined })}
                disabled={decide.isPending}
              >
                <Check className="mr-2 h-5 w-5" /> Approve
              </Button>
              <Button
                size="lg"
                variant="destructive"
                className="flex-1"
                onClick={() => {
                  if (!rejectComment.trim()) {
                    toast.error("Comment required to reject");
                    return;
                  }
                  decide.mutate({ ids: [selected.id], action: "rejected", comment: rejectComment });
                }}
                disabled={decide.isPending}
              >
                <X className="mr-2 h-5 w-5" /> Reject
              </Button>
            </div>
          </Card>
        )}
      </div>

      <Dialog open={!!previewUrl} onOpenChange={(o) => !o && setPreviewUrl(null)}>
        <DialogContent className="max-w-3xl">
          {previewUrl && <img src={previewUrl} alt="Receipt" className="w-full" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
