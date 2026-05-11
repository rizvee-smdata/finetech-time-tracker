import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { useState } from "react";

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
  const { isAdmin } = useAuth();

  const [selected, setSelected] = useState<{ id: string; name: string; scope: "today" | "all" } | null>(null);

  const { data: members, refetch } = useQuery({
    queryKey: ["team-members"],
    queryFn: async () => {
      const { data: profiles } = await supabase.from("profiles").select("*").order("full_name");
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      const { data: visits } = await supabase
        .from("customer_visits").select("user_id, id, meeting_at");
      const { data: time } = await supabase
        .from("time_entries").select("user_id, check_in, check_out");
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground">Monitor employee activity and manage access.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(members ?? []).map((m) => (
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
              <div className="rounded-md bg-muted p-2">
                <div className="text-xs text-muted-foreground">Today</div>
                <div className="font-semibold">{m.todayVisits}</div>
              </div>
              <div className="rounded-md bg-muted p-2">
                <div className="text-xs text-muted-foreground">Total visits</div>
                <div className="font-semibold">{m.totalVisits}</div>
              </div>
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
    </div>
  );
}
