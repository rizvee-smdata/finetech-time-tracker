import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, addDays, differenceInDays } from "date-fns";
import {
  PAYMENT_STATUS_META, formatUSD,
  type Milestone, type Contract,
} from "@/lib/contracts/types";

export const Route = createFileRoute("/_authenticated/contracts/payments")({
  component: PaymentsDashboard,
});

function PaymentsDashboard() {
  const { companyId } = useAuth();

  const contracts = useQuery({
    queryKey: ["pay-contracts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts").select("id, contract_number, title, total_value, company_id")
        .eq("company_id", companyId!);
      if (error) throw error;
      return (data ?? []) as Pick<Contract, "id" | "contract_number" | "title" | "total_value" | "company_id">[];
    },
  });

  const payments = useQuery({
    queryKey: ["pay-list", contracts.data?.map((c) => c.id).join(",")],
    enabled: !!contracts.data && contracts.data.length > 0,
    queryFn: async () => {
      const ids = contracts.data!.map((c) => c.id);
      const { data, error } = await supabase
        .from("contract_payments").select("*").in("contract_id", ids).order("due_date");
      if (error) throw error;
      return (data ?? []) as Milestone[];
    },
  });

  const today = new Date();
  const in30 = addDays(today, 30);
  const cMap = Object.fromEntries((contracts.data ?? []).map((c) => [c.id, c]));
  const all = payments.data ?? [];
  const overdue = all.filter((m) => m.status !== "received" && m.status !== "cancelled" && parseISO(m.due_date) < today);
  const upcoming = all.filter((m) => m.status !== "received" && m.status !== "cancelled" && parseISO(m.due_date) >= today && parseISO(m.due_date) <= in30);
  const received = all.filter((m) => m.status === "received");

  const totalContracted = (contracts.data ?? []).reduce((s, c) => s + Number(c.total_value), 0);
  const totalReceived = received.reduce((s, m) => s + Number(m.amount), 0);
  const totalOverdue = overdue.reduce((s, m) => s + Number(m.amount), 0);
  const totalUpcoming = upcoming.reduce((s, m) => s + Number(m.amount), 0);

  const renderList = (items: Milestone[], emptyText: string) => (
    items.length === 0 ? (
      <Card className="p-6 text-sm text-muted-foreground">{emptyText}</Card>
    ) : (
      <div className="space-y-2">
        {items.map((m) => {
          const c = cMap[m.contract_id];
          const pm = PAYMENT_STATUS_META[m.status];
          const days = differenceInDays(parseISO(m.due_date), today);
          return (
            <Card key={m.id} className="p-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-medium">{m.name}</div>
                    <Badge className={pm.tone} variant="outline">{pm.label}</Badge>
                    {c && <Link to="/contracts/$contractId" params={{ contractId: c.id }} className="text-xs text-muted-foreground hover:underline">
                      {c.contract_number} · {c.title || "Untitled"}
                    </Link>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Due {format(parseISO(m.due_date), "dd MMM yyyy")}
                    {days < 0 ? ` · ${Math.abs(days)}d overdue` : ` · in ${days}d`}
                  </div>
                </div>
                <div className="text-right font-semibold">{formatUSD(Number(m.amount))}</div>
              </div>
            </Card>
          );
        })}
      </div>
    )
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Contracted" value={formatUSD(totalContracted)} />
        <Stat label="Received" value={formatUSD(totalReceived)} tone="emerald" />
        <Stat label="Overdue" value={formatUSD(totalOverdue)} tone="destructive" />
        <Stat label="Due in 30 days" value={formatUSD(totalUpcoming)} tone="amber" />
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-destructive">Overdue ({overdue.length})</h3>
        {renderList(overdue, "No overdue payments. ")}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Upcoming next 30 days ({upcoming.length})</h3>
        {renderList(upcoming, "No upcoming milestones in the next 30 days.")}
      </section>
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
