import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, startOfDay, endOfDay, subDays, startOfMonth } from "date-fns";
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

  const [range, setRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: new Date(),
  });
  const fromIso = range?.from ? startOfDay(range.from).toISOString() : null;
  const toIso = range?.to ? endOfDay(range.to).toISOString() : (range?.from ? endOfDay(range.from).toISOString() : null);

  const [selected, setSelected] = useState<{ id: string; name: string; scope: "range" | "all" } | null>(null);

  const { data: members, refetch } = useQuery({
    queryKey: ["team-members", companyId, fromIso, toIso],
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
        const rangeVisits = userVisits.filter((v) => {
          if (!fromIso || !toIso) return true;
          const t = new Date(v.meeting_at).getTime();
          return t >= new Date(fromIso).getTime() && t <= new Date(toIso).getTime();
        }).length;
        const open = (time ?? []).find((t) => t.user_id === p.id && !t.check_out);
        return {
          ...p,
          roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as string),
          totalVisits: userVisits.length,
          rangeVisits,
          todayVisits,
          isCheckedIn: !!open,
        };
      }).filter((m) => !m.roles.includes("admin"));
    },
  });

  const { data: visitDetails, isLoading: loadingDetails } = useQuery({
    queryKey: ["team-visit-details", selected?.id, selected?.scope, companyId, fromIso, toIso],
    enabled: !!selected && !!companyId,
    queryFn: async () => {
      let q = supabase.from("customer_visits").select("*")
        .eq("user_id", selected!.id)
        .eq("company_id", companyId!)
        .order("meeting_at", { ascending: false });
      if (selected!.scope === "range" && fromIso && toIso) {
        q = q.gte("meeting_at", fromIso).lte("meeting_at", toIso);
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground">Monitor employee activity and manage access.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("justify-start text-left font-normal", !range && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {range?.from ? (
                  range.to ? `${format(range.from, "LLL d, y")} – ${format(range.to, "LLL d, y")}` : format(range.from, "LLL d, y")
                ) : <span>Pick date range</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={range}
                onSelect={setRange}
                numberOfMonths={2}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="sm" onClick={() => { const n = new Date(); setRange({ from: startOfDay(n), to: n }); }}>Today</Button>
          <Button variant="ghost" size="sm" onClick={() => { const n = new Date(); setRange({ from: subDays(n, 6), to: n }); }}>7d</Button>
          <Button variant="ghost" size="sm" onClick={() => { const n = new Date(); setRange({ from: subDays(n, 29), to: n }); }}>30d</Button>
          <Button variant="ghost" size="sm" onClick={() => { const n = new Date(); setRange({ from: startOfMonth(n), to: n }); }}>MTD</Button>
        </div>
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
                onClick={() => setSelected({ id: m.id, name: (m.full_name || m.email || "User"), scope: "range" })}
                className="rounded-md bg-muted p-2 hover:bg-muted/70 transition"
              >
                <div className="text-xs text-muted-foreground">In range</div>
                <div className="font-semibold">{m.rangeVisits}</div>
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
              {selected?.name} — {selected?.scope === "range" ? "Visits in range" : "All visits"}
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
