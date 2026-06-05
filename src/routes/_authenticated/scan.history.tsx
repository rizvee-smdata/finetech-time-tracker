import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { listCardScans } from "@/lib/cardScan/process.functions";

export const Route = createFileRoute("/_authenticated/scan/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const { companyId } = useAuth();
  const fn = useServerFn(listCardScans);
  const [filter, setFilter] = useState<"all" | "saved" | "discarded" | "processed">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["card-scans", companyId, filter],
    queryFn: () => fn({ data: { company_id: companyId!, filter } }),
    enabled: !!companyId,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon">
            <Link to="/scan"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <h1 className="text-2xl font-semibold">Scan history</h1>
        </div>
      </header>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="saved">Saved</TabsTrigger>
          <TabsTrigger value="processed">Pending</TabsTrigger>
          <TabsTrigger value="discarded">Discarded</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(data?.items ?? []).map((s: any) => (
          <Card key={s.id} className="overflow-hidden">
            <div className="aspect-[1.6/1] w-full bg-muted">
              {s.signed_url ? (
                <img src={s.signed_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full place-items-center text-xs text-muted-foreground">No preview</div>
              )}
            </div>
            <CardContent className="space-y-1 p-3 text-sm">
              <div className="truncate font-medium">{s.extracted?.full_name ?? "Untitled"}</div>
              <div className="truncate text-xs text-muted-foreground">
                {s.extracted?.company_name ?? "—"}
              </div>
              <div className="flex items-center justify-between pt-1">
                <Badge variant="outline" className="text-[10px]">{s.status}</Badge>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(s.created_at).toLocaleDateString()}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
        {data && data.items.length === 0 && (
          <p className="col-span-full text-sm text-muted-foreground">No scans yet.</p>
        )}
      </div>
    </div>
  );
}
