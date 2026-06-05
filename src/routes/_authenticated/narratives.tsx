import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { listNarratives } from "@/lib/narratives/api";
import { ROLE_LABEL, type NarrativeRole } from "@/lib/narratives/types";
import { fmtBDT, readTime } from "@/lib/narratives/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollText, Search, Settings as SettingsIcon, ArrowRight, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { generateNarrative } from "@/lib/narratives/generate.functions";
import { previousWeekRange } from "@/lib/narratives/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/narratives")({
  component: NarrativesIndex,
});

function NarrativesIndex() {
  const { companyId, company, isStaff } = useAuth();
  const [q, setQ] = useState("");
  const [generating, setGenerating] = useState<NarrativeRole | null>(null);
  const generate = useServerFn(generateNarrative);

  const { data: items = [], isLoading, refetch } = useQuery({
    queryKey: ["narratives", companyId],
    queryFn: () => (companyId ? listNarratives(companyId) : Promise.resolve([])),
    enabled: !!companyId,
  });

  const filtered = items.filter((n) => {
    if (!q) return true;
    const t = q.toLowerCase();
    return n.title.toLowerCase().includes(t) ||
      (n.summary || "").toLowerCase().includes(t) ||
      n.week_start.includes(t);
  });

  const latestByRole = (["ceo", "sales", "ops"] as NarrativeRole[]).map((r) => ({
    role: r,
    item: items.find((n) => n.role === r) || null,
  }));

  async function runGenerate(role: NarrativeRole) {
    if (!companyId) return;
    setGenerating(role);
    try {
      const { start, end } = previousWeekRange();
      await generate({ data: { company_id: companyId, role, week_start: start, week_end: end, language: "en" } });
      toast.success(`${ROLE_LABEL[role]} narrative generated`);
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{company?.name || "Executive Briefings"}</p>
          <h1 className="font-serif text-4xl font-semibold text-foreground">Weekly Narratives</h1>
          <p className="mt-1 text-sm text-muted-foreground">AI-written executive briefings — read like a memo, not a dashboard.</p>
        </div>
        {isStaff && (
          <Button asChild variant="outline" size="sm">
            <Link to="/narratives/settings"><SettingsIcon className="mr-2 h-4 w-4" /> Configure</Link>
          </Button>
        )}
      </header>

      {/* This week cards */}
      <section className="grid gap-4 md:grid-cols-3">
        {latestByRole.map(({ role, item }) => (
          <Card key={role} className="flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="rounded-sm uppercase tracking-wide">{ROLE_LABEL[role]}</Badge>
              {item && <span className="text-xs text-muted-foreground">{item.week_start}</span>}
            </div>
            {item ? (
              <>
                <h3 className="font-serif text-lg leading-snug">{item.title}</h3>
                <p className="line-clamp-3 text-sm text-muted-foreground">{item.summary}</p>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <Badge variant="outline">Rev {fmtBDT(item.metrics.revenue_closed)}</Badge>
                  <Badge variant="outline">Pipe {fmtBDT(item.metrics.pipeline_value)}</Badge>
                  <Badge variant="outline">Visits {item.metrics.visits_done}</Badge>
                </div>
                <div className="mt-auto flex items-center justify-between pt-2">
                  <span className="text-xs text-muted-foreground">{readTime(item.body_md)} min read</span>
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/narratives/$id" params={{ id: item.id }}>Read <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-start gap-3">
                <p className="text-sm text-muted-foreground">No narrative yet for this role.</p>
                {isStaff && (
                  <Button size="sm" onClick={() => runGenerate(role)} disabled={generating === role}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {generating === role ? "Generating…" : "Generate now"}
                  </Button>
                )}
              </div>
            )}
          </Card>
        ))}
      </section>

      {/* Archive */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-serif text-xl">Archive</h2>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search title, date…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
            <ScrollText className="h-8 w-8 opacity-50" />
            No narratives yet. The first batch will arrive Monday morning, or generate one now.
          </Card>
        ) : (
          <div className="divide-y rounded-xl border">
            {filtered.map((n) => (
              <Link
                key={n.id} to="/narratives/$id" params={{ id: n.id }}
                className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-accent/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="rounded-sm text-[10px] uppercase">{ROLE_LABEL[n.role]}</Badge>
                    <span className="text-xs text-muted-foreground">{n.week_start} → {n.week_end}</span>
                  </div>
                  <h4 className="mt-1 truncate font-serif text-base">{n.title}</h4>
                </div>
                <div className="hidden gap-1.5 text-[11px] md:flex">
                  <Badge variant="outline">{fmtBDT(n.metrics.revenue_closed)}</Badge>
                  <Badge variant="outline">{n.metrics.visits_done}v</Badge>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
