import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { findCompanion, getNarrative, listNarratives } from "@/lib/narratives/api";
import { ROLE_LABEL } from "@/lib/narratives/types";
import { fmtBDT, fmtPct, readTime } from "@/lib/narratives/utils";
import { exportNarrativePdf } from "@/lib/narratives/pdfExport";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, ArrowRight, Download, Share2, MessageCircle, Mail, GitCompare } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/narratives/$id")({
  component: NarrativeReader,
});

function NarrativeReader() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { companyId, company } = useAuth();

  const { data: report } = useQuery({
    queryKey: ["narrative", id],
    queryFn: () => getNarrative(id),
  });
  const { data: list = [] } = useQuery({
    queryKey: ["narratives", companyId],
    queryFn: () => (companyId ? listNarratives(companyId, 100) : Promise.resolve([])),
    enabled: !!companyId,
  });
  const { data: companion } = useQuery({
    queryKey: ["narrative-companion", report?.id],
    queryFn: () =>
      report && companyId ? findCompanion(companyId, report.week_start, report.role) : Promise.resolve(null),
    enabled: !!report && !!companyId,
  });

  const { prev, next } = useMemo(() => {
    if (!report) return { prev: null, next: null };
    const sameRole = list.filter((n) => n.role === report.role);
    const idx = sameRole.findIndex((n) => n.id === report.id);
    return {
      prev: idx >= 0 && idx < sameRole.length - 1 ? sameRole[idx + 1] : null,
      next: idx > 0 ? sameRole[idx - 1] : null,
    };
  }, [list, report]);

  if (!report) {
    return <div className="mx-auto max-w-3xl p-10 text-sm text-muted-foreground">Loading narrative…</div>;
  }

  const m = report.metrics;
  const link = typeof window !== "undefined" ? `${window.location.origin}/narratives/${report.id}` : "";

  const onShareWA = () => {
    const text = `${report.title}\n${report.summary}\n${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };
  const onShareEmail = () => {
    const subject = encodeURIComponent(`Weekly Briefing: ${report.title}`);
    const body = encodeURIComponent(`${report.summary}\n\n${link}`);
    window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
  };
  const onCopy = async () => {
    await navigator.clipboard.writeText(link);
    toast.success("Link copied");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/narratives"><ArrowLeft className="mr-1 h-4 w-4" /> All narratives</Link>
        </Button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => exportNarrativePdf(report, company?.name)}>
            <Download className="mr-1 h-4 w-4" /> PDF
          </Button>
          <Button variant="ghost" size="sm" onClick={onShareWA}><MessageCircle className="mr-1 h-4 w-4" /> WhatsApp</Button>
          <Button variant="ghost" size="sm" onClick={onShareEmail}><Mail className="mr-1 h-4 w-4" /> Email</Button>
          <Button variant="ghost" size="sm" onClick={onCopy}><Share2 className="mr-1 h-4 w-4" /> Copy link</Button>
        </div>
      </div>

      <header className="space-y-3 border-b pb-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <Badge variant="secondary" className="rounded-sm">{ROLE_LABEL[report.role]}</Badge>
          <span>{report.week_start} → {report.week_end}</span>
          <span>·</span>
          <span>{readTime(report.body_md)} min read</span>
        </div>
        <h1 className="font-serif text-4xl font-semibold leading-tight">{report.title}</h1>
        {report.summary && <p className="font-serif text-lg italic text-muted-foreground">{report.summary}</p>}
      </header>

      {/* Compact metric bar */}
      <Card className="grid grid-cols-3 gap-3 p-4 text-sm md:grid-cols-6">
        {[
          ["Revenue", fmtBDT(m.revenue_closed)],
          ["Pipeline", fmtBDT(m.pipeline_value)],
          ["Visits", `${m.visits_done}/${m.visits_target}`],
          ["Attendance", fmtPct(m.attendance_rate)],
          ["At-risk", String(m.at_risk_clients)],
          ["Expenses", fmtBDT(m.expenses_total)],
        ].map(([k, v]) => (
          <div key={k}>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{k}</div>
            <div className="font-serif text-lg font-semibold">{v}</div>
          </div>
        ))}
      </Card>

      {/* Narrative body */}
      <article className="prose prose-slate max-w-none font-serif text-[17px] leading-[1.8] dark:prose-invert">
        <ReactMarkdown>{report.body_md}</ReactMarkdown>
      </article>

      {/* Revenue trend */}
      {m.revenue_trend && m.revenue_trend.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-serif text-lg">Revenue trend · last 4 weeks</h3>
          <div className="h-56 w-full rounded-xl border bg-card p-3">
            <ResponsiveContainer>
              <BarChart data={m.revenue_trend}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="week" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => fmtBDT(v)} width={70} />
                <Tooltip formatter={(v: number) => fmtBDT(v)} />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Compare with same week last month */}
      {companion && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-serif text-lg">Same week last month</h3>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Card className="p-4">
              <div className="text-xs uppercase text-muted-foreground">This week</div>
              <div className="mt-1 font-serif text-base">{report.title}</div>
              <div className="mt-2 text-xs text-muted-foreground">Revenue {fmtBDT(report.metrics.revenue_closed)} · Pipeline {fmtBDT(report.metrics.pipeline_value)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs uppercase text-muted-foreground">{companion.week_start}</div>
              <Link to="/narratives/$id" params={{ id: companion.id }} className="mt-1 block font-serif text-base hover:underline">
                {companion.title}
              </Link>
              <div className="mt-2 text-xs text-muted-foreground">Revenue {fmtBDT(companion.metrics.revenue_closed)} · Pipeline {fmtBDT(companion.metrics.pipeline_value)}</div>
            </Card>
          </div>
        </section>
      )}

      <Separator />

      <nav className="flex items-center justify-between gap-3">
        {prev ? (
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/narratives/$id", params: { id: prev.id } })}>
            <ArrowLeft className="mr-1 h-4 w-4" /> {prev.week_start}
          </Button>
        ) : <span />}
        {next ? (
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/narratives/$id", params: { id: next.id } })}>
            {next.week_start} <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        ) : <span />}
      </nav>
    </div>
  );
}
