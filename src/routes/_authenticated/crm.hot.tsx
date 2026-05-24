import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flame, TrendingUp, Search } from "lucide-react";
import { formatMoney, stageMeta } from "@/lib/crm/types";
import { scoreLead, BAND_META, type ScoredLead } from "@/lib/crm/scoring";
import { formatDistanceToNow } from "date-fns";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/crm/hot")({
  component: HotLeadsPage,
});

function HotLeadsPage() {
  const { companyId } = useAuth();
  const [search, setSearch] = useState("");
  const [band, setBand] = useState<string>("all");

  const leadsQ = useQuery({
    queryKey: ["crm-hot-leads", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("crm_leads")
        .select("*")
        .eq("company_id", companyId)
        .not("stage", "in", "(won,lost)")
        .order("last_activity_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const activityCountsQ = useQuery({
    queryKey: ["crm-activity-counts", companyId, leadsQ.data?.length],
    enabled: !!leadsQ.data?.length,
    queryFn: async () => {
      const ids = (leadsQ.data ?? []).map((l: any) => l.id);
      if (ids.length === 0) return {} as Record<string, number>;
      const { data } = await sb
        .from("crm_lead_activities")
        .select("lead_id")
        .in("lead_id", ids);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((row: { lead_id: string }) => {
        counts[row.lead_id] = (counts[row.lead_id] ?? 0) + 1;
      });
      return counts;
    },
  });

  const scored: ScoredLead[] = useMemo(() => {
    const counts = activityCountsQ.data ?? {};
    return (leadsQ.data ?? [])
      .map((l: any) => scoreLead(l, counts[l.id] ?? 0))
      .sort((a: ScoredLead, b: ScoredLead) => b.score - a.score);
  }, [leadsQ.data, activityCountsQ.data]);

  const filtered = scored.filter((l) => {
    if (band !== "all" && l.scoreBand !== band) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        l.customer_name?.toLowerCase().includes(q) ||
        l.company_name?.toLowerCase().includes(q) ||
        l.contact_person?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totals = useMemo(() => {
    const buckets = { hot: 0, warm: 0, cool: 0, cold: 0 };
    scored.forEach((l) => { buckets[l.scoreBand]++; });
    return buckets;
  }, [scored]);

  const pipelineValue = useMemo(
    () => filtered.reduce((sum, l) => sum + Number(l.expected_value ?? 0), 0),
    [filtered],
  );

  if (!companyId) return <p className="text-sm text-muted-foreground">Select a company to view hot leads.</p>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Flame className="h-5 w-5 text-red-500" />Hot Leads
        </h2>
        <p className="text-sm text-muted-foreground">
          Automatically scored by stage, deal value, recency, and engagement.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {(["hot", "warm", "cool", "cold"] as const).map((b) => (
          <Card
            key={b}
            className={`p-3 cursor-pointer transition ${band === b ? "ring-2 " + BAND_META[b].ring : ""}`}
            onClick={() => setBand(band === b ? "all" : b)}
          >
            <div className="text-xs text-muted-foreground">{BAND_META[b].label}</div>
            <div className="text-2xl font-bold">{totals[b]}</div>
          </Card>
        ))}
        <Card className="p-3">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />Pipeline (filtered)
          </div>
          <div className="text-2xl font-bold">{formatMoney(pipelineValue)}</div>
        </Card>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, company, contact…"
            className="pl-8"
          />
        </div>
        <Select value={band} onValueChange={setBand}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All scores</SelectItem>
            <SelectItem value="hot">Hot only</SelectItem>
            <SelectItem value="warm">Warm only</SelectItem>
            <SelectItem value="cool">Cool only</SelectItem>
            <SelectItem value="cold">Cold only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {leadsQ.isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading leads…</Card>
      ) : filtered.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground text-center">No leads match the current filter.</Card>
      ) : (
        <div className="grid gap-2">
          {filtered.map((l) => <LeadScoreRow key={l.id} lead={l} />)}
        </div>
      )}
    </div>
  );
}

function LeadScoreRow({ lead }: { lead: ScoredLead }) {
  const meta = stageMeta(lead.stage);
  const bandMeta = BAND_META[lead.scoreBand];

  return (
    <Link to="/crm/$leadId" params={{ leadId: lead.id }}>
      <Card className="p-3 hover:bg-muted/40 transition">
        <div className="flex items-center gap-3">
          <div className={`h-12 w-12 rounded-full flex items-center justify-center font-bold border-2 ${bandMeta.color}`}>
            {lead.score}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium truncate">{lead.customer_name}</span>
              {lead.company_name && <span className="text-xs text-muted-foreground">· {lead.company_name}</span>}
              <Badge variant="outline" className={bandMeta.color}>{bandMeta.label}</Badge>
              <Badge variant="outline">{meta.label}</Badge>
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
              {lead.expected_value && <span>{formatMoney(Number(lead.expected_value), lead.currency)}</span>}
              <span>· {lead.probability}% prob</span>
              {lead.last_activity_at && (
                <span>· {formatDistanceToNow(new Date(lead.last_activity_at), { addSuffix: true })}</span>
              )}
            </div>
            <div className="flex gap-1 flex-wrap mt-1.5">
              {lead.scoreFactors.slice(0, 4).map((f, i) => (
                <span
                  key={i}
                  className={`text-[10px] px-1.5 py-0.5 rounded ${f.value >= 0 ? "bg-muted text-muted-foreground" : "bg-destructive/10 text-destructive"}`}
                >
                  {f.label} {f.value >= 0 ? "+" : ""}{f.value}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
