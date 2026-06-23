import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getPartnerPortalDigest } from "@/lib/visit-analytics/partner-portal.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Handshake, Building2, TrendingUp, Calendar } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/visits/partner-portal")({
  component: PartnerPortalPage,
});

function PartnerPortalPage() {
  const [partnerId, setPartnerId] = useState<string | undefined>(undefined);
  const fetchDigest = useServerFn(getPartnerPortalDigest);
  const { data, isLoading } = useQuery({
    queryKey: ["partner-portal", partnerId],
    queryFn: () => fetchDigest({ data: { partner_id: partnerId } }),
  });

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Handshake className="h-6 w-6" /> Partner Portal Lite
          </h1>
          <p className="text-sm text-muted-foreground">
            Read-only digest of visits, pipeline, and next actions on partner-managed accounts.
          </p>
        </div>
        <Select
          value={partnerId ?? "all"}
          onValueChange={(v) => setPartnerId(v === "all" ? undefined : v)}
        >
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="All partners" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All partners</SelectItem>
            {(data?.partners ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} ({p.account_count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading partner digest…</p>}

      {!isLoading && data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Partners
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{data.partners.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Accounts covered
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{data.digests.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Open pipeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  ৳{fmt(data.digests.reduce((s, d) => s + d.open_pipeline, 0))}
                </div>
              </CardContent>
            </Card>
          </div>

          {data.digests.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No partner-managed accounts found.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.digests.map((d) => (
                <Card key={d.account_id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Building2 className="h-4 w-4" /> {d.account_name}
                        </CardTitle>
                        {d.partner_name && (
                          <p className="text-xs text-muted-foreground mt-1">
                            via {d.partner_name}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline">{d.visits_30d} visits / 30d</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      {d.last_visit_at
                        ? `Last visit ${formatDistanceToNow(new Date(d.last_visit_at), { addSuffix: true })}`
                        : "No visits yet"}
                    </div>
                    {d.last_visit_summary && (
                      <p className="text-foreground/80 line-clamp-2">{d.last_visit_summary}</p>
                    )}
                    {d.next_action && (
                      <p className="text-amber-700 dark:text-amber-400">
                        Next: {d.next_action}
                      </p>
                    )}
                    <div className="flex items-center gap-3 pt-1 text-muted-foreground">
                      <TrendingUp className="h-3.5 w-3.5" />
                      <span>
                        {d.open_deals} open deal{d.open_deals === 1 ? "" : "s"} · ৳
                        {fmt(d.open_pipeline)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
