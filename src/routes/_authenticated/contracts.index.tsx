import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FileText, Plus, AlertTriangle } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { useState } from "react";
import {
  CONTRACT_STATUS_META, CONTRACT_TYPE_LABEL, formatUSD,
  type Contract, type Milestone,
} from "@/lib/contracts/types";

export const Route = createFileRoute("/_authenticated/contracts/")({
  component: ContractsList,
});

function ContractsList() {
  const { companyId } = useAuth();
  const [q, setQ] = useState("");

  const contracts = useQuery({
    queryKey: ["contracts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts").select("*")
        .eq("company_id", companyId!).order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Contract[];
    },
  });

  const milestones = useQuery({
    queryKey: ["contracts-milestones", contracts.data?.map((c) => c.id).join(",")],
    enabled: !!contracts.data && contracts.data.length > 0,
    queryFn: async () => {
      const ids = contracts.data!.map((c) => c.id);
      const { data, error } = await supabase
        .from("contract_payments").select("*").in("contract_id", ids);
      if (error) throw error;
      return (data ?? []) as Milestone[];
    },
  });

  const list = (contracts.data ?? []).filter((c) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return c.contract_number.toLowerCase().includes(s) || (c.title || "").toLowerCase().includes(s);
  });

  const stats = (() => {
    const all = contracts.data ?? [];
    const ms = milestones.data ?? [];
    const total = all.reduce((s, c) => s + Number(c.total_value), 0);
    const received = ms.filter((m) => m.status === "received").reduce((s, m) => s + Number(m.amount), 0);
    const today = new Date();
    const overdue = ms.filter((m) => m.status !== "received" && m.status !== "cancelled" && new Date(m.due_date) < today).length;
    return { total, received, outstanding: total - received, overdue };
  })();

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Contracted value" value={formatUSD(stats.total)} />
        <Stat label="Received" value={formatUSD(stats.received)} tone="emerald" />
        <Stat label="Outstanding" value={formatUSD(stats.outstanding)} tone="amber" />
        <Stat label="Overdue milestones" value={String(stats.overdue)} tone={stats.overdue > 0 ? "destructive" : undefined} />
      </div>

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <Input placeholder="Search contract # or title" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <div className="ml-auto"><Button asChild size="sm"><Link to="/contracts/new"><Plus className="mr-1 h-4 w-4" /> New</Link></Button></div>
      </Card>

      {contracts.isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>
      ) : list.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No contracts yet.</Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((c) => {
            const ms = (milestones.data ?? []).filter((m) => m.contract_id === c.id);
            const received = ms.filter((m) => m.status === "received").reduce((s, m) => s + Number(m.amount), 0);
            const pct = c.total_value > 0 ? Math.round((received / Number(c.total_value)) * 100) : 0;
            const status = CONTRACT_STATUS_META[c.status];
            const expiresSoon = c.end_date && differenceInDays(parseISO(c.end_date), new Date()) <= 60 && differenceInDays(parseISO(c.end_date), new Date()) > 0;
            return (
              <Link key={c.id} to="/contracts/$contractId" params={{ contractId: c.id }}>
                <Card className="cursor-pointer p-4 transition hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {c.contract_number}
                      </div>
                      <div className="truncate text-sm text-muted-foreground">{c.title || "Untitled contract"}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                        <Badge variant="outline">{CONTRACT_TYPE_LABEL[c.contract_type]}</Badge>
                        <Badge className={status.tone} variant="outline">{status.label}</Badge>
                        {expiresSoon && (
                          <Badge variant="outline" className="border-amber-500 text-amber-700">
                            <AlertTriangle className="mr-1 h-3 w-3" />Renews soon
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-semibold">{formatUSD(Number(c.total_value))}</div>
                      <div className="text-xs text-muted-foreground">{pct}% collected</div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    {format(parseISO(c.start_date), "dd MMM yyyy")}{c.end_date ? ` → ${format(parseISO(c.end_date), "dd MMM yyyy")}` : ""}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "amber" | "destructive" }) {
  const cls = tone === "emerald" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${cls}`}>{value}</div>
    </Card>
  );
}
