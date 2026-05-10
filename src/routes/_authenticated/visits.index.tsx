import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/visits/")({
  component: VisitsList,
});

function VisitsList() {
  const { user, isStaff } = useAuth();
  const [q, setQ] = useState("");

  const { data } = useQuery({
    queryKey: ["visits", user?.id, isStaff],
    enabled: !!user,
    queryFn: async () => {
      const query = supabase
        .from("customer_visits")
        .select("*, profiles:user_id(full_name, email)")
        .order("meeting_at", { ascending: false });
      if (!isStaff) query.eq("user_id", user!.id);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = (data ?? []).filter((v) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      v.customer_name?.toLowerCase().includes(s) ||
      v.company?.toLowerCase().includes(s) ||
      v.location?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customer visits</h1>
          <p className="text-sm text-muted-foreground">{isStaff ? "All team visits" : "Your visit reports"}</p>
        </div>
        <Button asChild><Link to="/visits/new"><Plus className="mr-2 h-4 w-4" />New visit</Link></Button>
      </header>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, company, location..." className="pl-9" />
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            No visits found. Click "New visit" to add one.
          </Card>
        )}
        {filtered.map((v) => (
          <Card key={v.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{v.customer_name} <span className="font-normal text-muted-foreground">· {v.company || "—"}</span></div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(v.meeting_at), "PPpp")}
                  {v.location && <> · {v.location}</>}
                  {isStaff && v.profiles && <> · {(v.profiles as any).full_name || (v.profiles as any).email}</>}
                </div>
              </div>
              {v.next_meeting_at && (
                <div className="text-right text-xs">
                  <div className="text-muted-foreground">Next meeting</div>
                  <div className="font-medium">{format(new Date(v.next_meeting_at), "MMM d, p")}</div>
                </div>
              )}
            </div>
            {v.discussion_summary && <p className="mt-3 text-sm">{v.discussion_summary}</p>}
            {v.next_action && (
              <div className="mt-3 rounded-md bg-accent/50 px-3 py-2 text-sm">
                <span className="font-medium text-accent-foreground">Next action: </span>{v.next_action}
              </div>
            )}
            {v.remarks && <p className="mt-2 text-xs text-muted-foreground">Remarks: {v.remarks}</p>}
          </Card>
        ))}
      </div>
    </div>
  );
}
