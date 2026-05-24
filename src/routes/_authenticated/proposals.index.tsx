import { useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { format, differenceInCalendarDays } from "date-fns";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, Pencil, Copy, FileDown, Trash2, Sparkles } from "lucide-react";
import { useProposalsStore } from "@/lib/proposals/storage";
import { fmtMoney, fmtMoneyShort, statusColor } from "@/lib/proposals/utils";
import { grandTotal } from "@/lib/proposals/utils";
import { TEMPLATE_META, INDUSTRIES } from "@/lib/proposals/templates";

export const Route = createFileRoute("/_authenticated/proposals/")({
  component: ProposalLibraryPage,
});

function ProposalLibraryPage() {
  const router = useRouter();
  const { proposals, duplicate, remove } = useProposalsStore();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [industry, setIndustry] = useState("all");

  const filtered = useMemo(() => {
    return proposals.filter((p) => {
      if (status !== "all" && p.status !== status) return false;
      if (industry !== "all" && p.clientIndustry !== industry) return false;
      if (q && !`${p.title} ${p.clientCompany} ${p.clientName}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [proposals, q, status, industry]);

  const stats = useMemo(() => {
    const sent = proposals.filter((p) => ["sent", "accepted", "rejected"].includes(p.status));
    const accepted = proposals.filter((p) => p.status === "accepted");
    const acceptValue = accepted.reduce((s, p) => s + grandTotal(p.proposedProducts), 0);
    const closeDays = accepted
      .map((p) => (p.sentAt && p.decidedAt ? differenceInCalendarDays(new Date(p.decidedAt), new Date(p.sentAt)) : null))
      .filter((x): x is number => x !== null);
    const avgClose = closeDays.length ? closeDays.reduce((a, b) => a + b, 0) / closeDays.length : 0;
    return {
      total: proposals.length,
      acceptRate: sent.length ? Math.round((accepted.length / sent.length) * 100) : 0,
      acceptValue,
      avgClose,
    };
  }, [proposals]);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Proposals" value={String(stats.total)} />
        <StatCard label="Acceptance Rate" value={`${stats.acceptRate}%`} accent />
        <StatCard label="Won Value" value={fmtMoneyShort(stats.acceptValue, "BDT")} accent />
        <StatCard label="Avg. Close" value={`${Math.round(stats.avgClose)} days`} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card/40 p-3 backdrop-blur">
        <Input
          placeholder="Search by client or title…"
          className="max-w-xs"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={industry} onValueChange={setIndustry}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All industries</SelectItem>
            {INDUSTRIES.map((i) => (
              <SelectItem key={i} value={i}>{i}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto" />
        <Button asChild className="bg-emerald-500 hover:bg-emerald-600">
          <Link to="/proposals/new"><Sparkles className="mr-2 h-4 w-4" /> New Proposal</Link>
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="grid place-items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <FileDown className="h-8 w-8 text-emerald-400" />
            <div>No proposals match. Start a new one with the wizard.</div>
            <Button asChild className="mt-2 bg-emerald-500 hover:bg-emerald-600">
              <Link to="/proposals/new">Open wizard</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const value = grandTotal(p.proposedProducts);
            const tpl = TEMPLATE_META[p.template];
            return (
              <Card key={p.id} className="border-border/60 bg-card/40 backdrop-blur transition-colors hover:border-emerald-500/40">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{p.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{p.clientCompany}</div>
                    </div>
                    <Badge variant="outline" className={statusColor(p.status)}>{p.status}</Badge>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">{p.clientIndustry}</Badge>
                    <Badge variant="outline" className="text-[10px]">{tpl?.icon} {tpl?.label}</Badge>
                  </div>

                  <div>
                    <div className="text-[11px] text-muted-foreground">Total value</div>
                    <div className="text-xl font-bold text-emerald-400">{fmtMoney(value, p.proposedProducts[0]?.currency ?? "BDT")}</div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Created {format(new Date(p.createdAt), "dd MMM yyyy")}</span>
                    <span>v{p.version}</span>
                  </div>

                  <div className="flex flex-wrap gap-1 pt-1">
                    <Button asChild size="sm" variant="ghost" className="h-8 px-2">
                      <Link to="/proposals/$proposalId" params={{ proposalId: p.id }}><Eye className="h-4 w-4" /></Link>
                    </Button>
                    <Button asChild size="sm" variant="ghost" className="h-8 px-2">
                      <Link to="/proposals/$proposalId" params={{ proposalId: p.id }}><Pencil className="h-4 w-4" /></Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2"
                      onClick={() => {
                        const copy = duplicate(p.id);
                        if (copy) {
                          toast.success("Proposal duplicated");
                          router.navigate({ to: "/proposals/$proposalId", params: { proposalId: copy.id } });
                        }
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2"
                      onClick={() => {
                        router.navigate({ to: "/proposals/$proposalId", params: { proposalId: p.id }, search: { print: 1 } as never });
                      }}
                    >
                      <FileDown className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto h-8 px-2 text-red-400 hover:text-red-300"
                      onClick={() => {
                        if (confirm("Archive this proposal?")) {
                          remove(p.id);
                          toast.success("Proposal archived");
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className="border-border/60 bg-card/40 backdrop-blur">
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-bold ${accent ? "text-emerald-400" : "text-foreground"}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
