import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, LogIn, LogOut } from "lucide-react";
import { format, formatDistanceStrict } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/check-in")({
  component: CheckInPage,
});

function CheckInPage() {
  const { user, companyId } = useAuth();
  const qc = useQueryClient();

  const { data: open } = useQuery({
    queryKey: ["open-time", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("time_entries").select("*").eq("user_id", user!.id)
        .is("check_out", null).maybeSingle();
      return data;
    },
  });

  const { data: history } = useQuery({
    queryKey: ["time-history", user?.id, companyId],
    enabled: !!user,
    queryFn: async () => {
      const q = supabase
        .from("time_entries").select("*").eq("user_id", user!.id)
        .order("check_in", { ascending: false }).limit(20);
      if (companyId) q.eq("company_id", companyId);
      const { data } = await q;
      return data ?? [];
    },
  });

  async function checkIn() {
    if (!companyId) { toast.error("Select a company first"); return; }
    const { error } = await supabase.from("time_entries").insert({ user_id: user!.id, company_id: companyId });
    if (error) toast.error(error.message);
    else { toast.success("Checked in"); qc.invalidateQueries(); }
  }
  async function checkOut() {
    if (!open) return;
    const { error } = await supabase.from("time_entries").update({ check_out: new Date().toISOString() }).eq("id", open.id);
    if (error) toast.error(error.message);
    else { toast.success("Checked out"); qc.invalidateQueries(); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Time clock</h1>
        <p className="text-sm text-muted-foreground">Mark your office start and end time.</p>
      </div>

      <Card className="p-8 text-center" style={{ background: "var(--gradient-soft)" }}>
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
          <Clock className="h-8 w-8" />
        </div>
        {open ? (
          <>
            <p className="text-sm text-muted-foreground">Checked in at</p>
            <p className="text-2xl font-semibold">{format(new Date(open.check_in), "PPpp")}</p>
            <p className="mt-1 text-sm text-success">Active for {formatDistanceStrict(new Date(open.check_in), new Date())}</p>
            <Button size="lg" className="mt-6" onClick={checkOut}>
              <LogOut className="mr-2 h-4 w-4" />Check out
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">You are not checked in</p>
            <Button size="lg" className="mt-6" onClick={checkIn}>
              <LogIn className="mr-2 h-4 w-4" />Check in now
            </Button>
          </>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 font-semibold">Recent activity</h2>
        <div className="divide-y divide-border">
          {(history ?? []).length === 0 && <p className="text-sm text-muted-foreground">No history yet.</p>}
          {(history ?? []).map((t) => (
            <div key={t.id} className="flex items-center justify-between py-3 text-sm">
              <div>
                <div className="font-medium">{format(new Date(t.check_in), "PP")}</div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(t.check_in), "p")} → {t.check_out ? format(new Date(t.check_out), "p") : "—"}
                </div>
              </div>
              <div className="text-right">
                {t.check_out
                  ? <span className="font-medium">{formatDistanceStrict(new Date(t.check_in), new Date(t.check_out))}</span>
                  : <span className="text-success">Active</span>}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
