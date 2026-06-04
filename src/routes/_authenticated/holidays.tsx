import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trash2, Plus, Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";

export const Route = createFileRoute("/_authenticated/holidays")({
  beforeLoad: async () => {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles").select("role").eq("user_id", s.session.user.id);
    const isStaff = (roles ?? []).some((r) => r.role === "admin" || r.role === "manager");
    if (!isStaff) throw redirect({ to: "/dashboard" });
  },
  component: HolidaysPage,
});

function HolidaysPage() {
  const { companyId, company } = useAuth();
  const qc = useQueryClient();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");

  const list = useQuery({
    queryKey: ["company-holidays", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_holidays")
        .select("id, holiday_date, name")
        .eq("company_id", companyId!)
        .order("holiday_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("No company selected");
      if (!date || !name.trim()) throw new Error("Date and name required");
      const { error } = await supabase.from("company_holidays").insert({
        company_id: companyId,
        holiday_date: date,
        name: name.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Holiday added");
      setDate(""); setName("");
      qc.invalidateQueries({ queryKey: ["company-holidays"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("company_holidays").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["company-holidays"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Company holidays</h1>
        <p className="text-sm text-muted-foreground">
          {company?.name ? `${company.name} — ` : ""}
          Visit-entry reminders skip Fridays and the dates you add here.
        </p>
      </header>

      <Card className="p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Plus className="h-4 w-4" /> Add holiday
        </h2>
        <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Name</Label>
            <Input placeholder="e.g. National Day" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button onClick={() => add.mutate()} disabled={add.isPending}>Add</Button>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Calendar className="h-4 w-4" /> Holidays
        </h2>
        {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!list.isLoading && (list.data?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">No holidays defined yet.</p>
        )}
        <ul className="divide-y divide-border">
          {(list.data ?? []).map((h) => (
            <li key={h.id} className="flex items-center justify-between py-2">
              <div>
                <div className="font-medium">{h.name}</div>
                <div className="text-xs text-muted-foreground">
                  {format(parseISO(h.holiday_date), "EEEE, dd MMM yyyy")}
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => del.mutate(h.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      <div className="text-sm">
        <Link to="/settings" className="text-primary hover:underline">← Back to settings</Link>
      </div>
    </div>
  );
}
