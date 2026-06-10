import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { useState } from "react";
import { PaginationBar, usePagination } from "@/components/PageSizeSelect";

export const Route = createFileRoute("/_authenticated/team")({
  beforeLoad: async () => {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", s.session.user.id);
    const list = (roles ?? []).map((r) => r.role);
    if (!list.includes("admin") && !list.includes("manager")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: TeamPage,
});

function TeamPage() {
  const { isAdmin, companyId } = useAuth();

  const [selected, setSelected] = useState<{ id: string; name: string; scope: "today" | "all" } | null>(null);

  const { data: members, refetch } = useQuery({
    queryKey: ["team-members", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data: cm } = await supabase
        .from("company_members")
        .select("user_id")
        .eq("company_id", companyId!);
      const memberIds = (cm ?? []).map((r) => r.user_id);
      if (memberIds.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles").select("*").in("id", memberIds).order("full_name");
      const { data: roles } = await supabase
        .from("user_roles").select("user_id, role").in("user_id", memberIds);
      const { data: visits } = await supabase
        .from("customer_visits").select("user_id, id, meeting_at")
        .eq("company_id", companyId!).in("user_id", memberIds);
      const { data: time } = await supabase
        .from("time_entries").select("user_id, check_in, check_out").in("user_id", memberIds);
      return (profiles ?? []).map((p) => {
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const userVisits = (visits ?? []).filter((v) => v.user_id === p.id);
        const todayVisits = userVisits.filter((v) => new Date(v.meeting_at) >= todayStart).length;
        const open = (time ?? []).find((t) => t.user_id === p.id && !t.check_out);
        return {
          ...p,
          roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as string),
          totalVisits: userVisits.length,
          todayVisits,
          isCheckedIn: !!open,
        };
      });
    },
  });

  const { data: visitDetails, isLoading: loadingDetails } = useQuery({
    queryKey: ["team-visit-details", selected?.id, selected?.scope],
    enabled: !!selected,
    queryFn: async () => {
      let q = supabase.from("customer_visits").select("*").eq("user_id", selected!.id).order("meeting_at", { ascending: false });
      if (selected!.scope === "today") {
        const start = new Date(); start.setHours(0, 0, 0, 0);
        q = q.gte("meeting_at", start.toISOString());
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  async function setRole(userId: string, newRole: "admin" | "manager" | "employee") {
    // Remove existing roles for this user, set new one
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole });
    if (error) toast.error(error.message);
    else { toast.success("Role updated"); refetch(); }
  }

  const pg = usePagination(members ?? [], 20);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground">Monitor employee activity and manage access.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pg.paged.map((m) => (
          <Card key={m.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{m.full_name || m.email}</div>
                <div className="text-xs text-muted-foreground">{m.email}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.roles.map((r) => (
                    <Badge key={r} variant={r === "admin" ? "default" : "secondary"}>{r}</Badge>
                  ))}
                </div>
              </div>
              {m.isCheckedIn && <Badge className="bg-success text-success-foreground">On clock</Badge>}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-center">
              <button
                type="button"
                onClick={() => setSelected({ id: m.id, name: (m.full_name || m.email || "User"), scope: "today" })}
                className="rounded-md bg-muted p-2 hover:bg-muted/70 transition"
              >
                <div className="text-xs text-muted-foreground">Today</div>
                <div className="font-semibold">{m.todayVisits}</div>
              </button>
              <button
                type="button"
                onClick={() => setSelected({ id: m.id, name: (m.full_name || m.email || "User"), scope: "all" })}
                className="rounded-md bg-muted p-2 hover:bg-muted/70 transition"
              >
                <div className="text-xs text-muted-foreground">Total visits</div>
                <div className="font-semibold">{m.totalVisits}</div>
              </button>
            </div>
            {isAdmin && (
              <div className="mt-4">
                <Select onValueChange={(v) => setRole(m.id, v as any)} defaultValue={m.roles[0] ?? "employee"}>
                  <SelectTrigger><SelectValue placeholder="Change role" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="mt-3 text-xs text-muted-foreground">Joined {format(new Date(m.created_at), "PP")}</div>
          </Card>
        ))}
      </div>

      <PaginationBar {...pg} label="members" />

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selected?.name} — {selected?.scope === "today" ? "Today's visits" : "All visits"}
            </DialogTitle>
          </DialogHeader>
          {loadingDetails ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (visitDetails ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">No visits found.</div>
          ) : (
            <div className="space-y-3">
              {(visitDetails ?? []).map((v: any) => (
                <Card key={v.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{v.customer_name}</div>
                      {v.company && <div className="text-xs text-muted-foreground">{v.company}</div>}
                    </div>
                    <div className="text-xs text-muted-foreground">{format(new Date(v.meeting_at), "PPp")}</div>
                  </div>
                  {v.contact_number && <div className="mt-1 text-xs">📞 {v.contact_number}</div>}
                  {v.location && <div className="text-xs text-muted-foreground">📍 {v.location}</div>}
                  {v.discussion_summary && <div className="mt-2 text-sm"><span className="font-medium">Discussion:</span> {v.discussion_summary}</div>}
                  {v.next_action && <div className="text-sm"><span className="font-medium">Next action:</span> {v.next_action}</div>}
                  {v.next_meeting_at && <div className="text-xs text-muted-foreground">Next meeting: {format(new Date(v.next_meeting_at), "PPp")}</div>}
                  {v.remarks && <div className="text-xs text-muted-foreground mt-1">Remarks: {v.remarks}</div>}
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
