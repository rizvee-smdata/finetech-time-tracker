import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/crm/types";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Check, X, FileText } from "lucide-react";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/crm/quotes")({
  component: QuotesPage,
});

type QuoteRow = {
  id: string;
  title: string;
  status: string;
  approval_status: string;
  amount: number;
  currency: string;
  discount_pct: number;
  version: number;
  valid_until: string | null;
  created_at: string;
  created_by: string | null;
  approval_requested_at: string | null;
  approval_comment: string | null;
  lead_id: string;
  lead?: { customer_name: string; company_name: string | null } | null;
  creator?: { full_name: string | null; email: string | null } | null;
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/15 text-blue-600",
  accepted: "bg-emerald-500/15 text-emerald-600",
  rejected: "bg-rose-500/15 text-rose-600",
  expired: "bg-amber-500/15 text-amber-700",
};

const APPROVAL_COLORS: Record<string, string> = {
  not_requested: "bg-muted text-muted-foreground",
  pending: "bg-amber-500/15 text-amber-700",
  approved: "bg-emerald-500/15 text-emerald-600",
  rejected: "bg-rose-500/15 text-rose-600",
};

function QuotesPage() {
  const { companyId, user, isStaff, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"all" | "pending" | "draft" | "sent" | "accepted">("all");
  const [search, setSearch] = useState("");

  const quotes = useQuery({
    queryKey: ["crm-quotes-all", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<QuoteRow[]> => {
      const { data, error } = await sb
        .from("crm_quotes")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as QuoteRow[];
      const leadIds = Array.from(new Set(rows.map((r) => r.lead_id)));
      const userIds = Array.from(new Set(rows.map((r) => r.created_by).filter(Boolean))) as string[];
      const [{ data: leads }, { data: profs }] = await Promise.all([
        leadIds.length
          ? sb.from("crm_leads").select("id, customer_name, company_name").in("id", leadIds)
          : Promise.resolve({ data: [] }),
        userIds.length
          ? sb.from("profiles").select("id, full_name, email").in("id", userIds)
          : Promise.resolve({ data: [] }),
      ]);
      const leadMap = new Map<string, any>((leads ?? []).map((l: any) => [l.id, l]));
      const profMap = new Map<string, any>((profs ?? []).map((p: any) => [p.id, p]));
      for (const r of rows) {
        r.lead = (leadMap.get(r.lead_id) as any) ?? null;
        r.creator = r.created_by ? ((profMap.get(r.created_by) as any) ?? null) : null;
      }
      return rows;
    },
  });

  const decideMut = useMutation({
    mutationFn: async (p: { id: string; approve: boolean; comment?: string }) => {
      const { error } = await sb
        .from("crm_quotes")
        .update({
          approval_status: p.approve ? "approved" : "rejected",
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
          approval_comment: p.comment ?? null,
        })
        .eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast({ title: v.approve ? "Quote approved" : "Quote rejected" });
      qc.invalidateQueries({ queryKey: ["crm-quotes-all"] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    const list = quotes.data ?? [];
    return list.filter((q) => {
      if (tab === "pending" && q.approval_status !== "pending") return false;
      if (tab === "draft" && q.status !== "draft") return false;
      if (tab === "sent" && q.status !== "sent") return false;
      if (tab === "accepted" && q.status !== "accepted") return false;
      if (search) {
        const s = search.toLowerCase();
        const blob = `${q.title} ${q.lead?.customer_name ?? ""} ${q.lead?.company_name ?? ""}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }
      return true;
    });
  }, [quotes.data, tab, search]);

  const stats = useMemo(() => {
    const all = quotes.data ?? [];
    const totals = { count: all.length, pending: 0, sent: 0, accepted: 0, value: 0 };
    for (const q of all) {
      if (q.approval_status === "pending") totals.pending++;
      if (q.status === "sent") totals.sent++;
      if (q.status === "accepted") {
        totals.accepted++;
        totals.value += Number(q.amount) || 0;
      }
    }
    return totals;
  }, [quotes.data]);

  const canApprove = isStaff || isAdmin;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Quotes</h1>
        <p className="text-sm text-muted-foreground">All proposals and approval queue across leads.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <StatTile label="Total quotes" value={String(stats.count)} />
        <StatTile label="Pending approval" value={String(stats.pending)} tone="amber" />
        <StatTile label="Sent" value={String(stats.sent)} />
        <StatTile label="Accepted value" value={formatMoney(stats.value, "USD")} tone="emerald" />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-md border p-1">
            {(["all", "pending", "draft", "sent", "accepted"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={
                  "rounded px-3 py-1 text-xs font-medium capitalize transition-colors " +
                  (tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")
                }
              >
                {t}
              </button>
            ))}
          </div>
          <Input
            placeholder="Search title, customer, company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <div className="ml-auto text-xs text-muted-foreground">{filtered.length} shown</div>
        </div>
      </Card>

      <Card className="divide-y">
        {quotes.isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading quotes...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No quotes match.</div>
        ) : (
          filtered.map((q) => (
            <div key={q.id} className="flex flex-wrap items-center gap-3 p-4">
              <FileText className="size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to="/crm/$leadId"
                    params={{ leadId: q.lead_id }}
                    className="font-medium hover:underline"
                  >
                    {q.title}
                  </Link>
                  <Badge variant="outline" className="text-[10px]">v{q.version}</Badge>
                  <Badge className={STATUS_COLORS[q.status] ?? ""}>{q.status}</Badge>
                  {q.approval_status !== "not_requested" && (
                    <Badge className={APPROVAL_COLORS[q.approval_status] ?? ""}>
                      approval: {q.approval_status}
                    </Badge>
                  )}
                  {q.discount_pct > 0 && (
                    <Badge variant="outline" className="text-amber-700">−{q.discount_pct}%</Badge>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {q.lead?.customer_name ?? "—"}
                  {q.lead?.company_name ? ` · ${q.lead.company_name}` : ""}
                  {" · "}by {q.creator?.full_name ?? q.creator?.email ?? "Unknown"}
                  {" · "}{format(parseISO(q.created_at), "MMM d, yyyy")}
                  {q.valid_until ? ` · valid until ${format(parseISO(q.valid_until), "MMM d")}` : ""}
                </div>
                {q.approval_comment && (
                  <div className="mt-1 text-xs italic text-muted-foreground">"{q.approval_comment}"</div>
                )}
              </div>
              <div className="text-right">
                <div className="font-semibold">{formatMoney(Number(q.amount) || 0, q.currency)}</div>
              </div>
              {canApprove && q.approval_status === "pending" && (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-emerald-600"
                    onClick={() => decideMut.mutate({ id: q.id, approve: true })}
                  >
                    <Check className="size-4" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-rose-600"
                    onClick={() => {
                      const c = window.prompt("Reason for rejection (optional)") ?? undefined;
                      decideMut.mutate({ id: q.id, approve: false, comment: c });
                    }}
                  >
                    <X className="size-4" /> Reject
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: "amber" | "emerald" }) {
  const toneClass =
    tone === "amber" ? "text-amber-700" : tone === "emerald" ? "text-emerald-600" : "text-foreground";
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={"mt-1 text-2xl font-semibold " + toneClass}>{value}</div>
    </Card>
  );
}
