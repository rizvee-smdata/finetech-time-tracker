import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/planning/new")({
  component: NewPlan,
});

function NewPlan() {
  const { user, companyId } = useAuth();
  const navigate = useNavigate();
  const [planDate, setPlanDate] = useState(new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState("");
  const [territory, setTerritory] = useState("");
  const [startLocation, setStartLocation] = useState("");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (!user || !companyId) throw new Error("Auth required");
      const { data, error } = await supabase
        .from("route_plans")
        .insert({
          user_id: user.id,
          company_id: companyId,
          created_by: user.id,
          plan_date: planDate,
          title: title || null,
          territory: territory || null,
          start_location: startLocation || null,
          notes: notes || null,
          status: "draft",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success("Plan created — add stops next");
      navigate({ to: "/planning/$planId", params: { planId: id } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="mx-auto max-w-2xl p-6">
      <h2 className="text-lg font-semibold">New route plan</h2>
      <p className="mt-1 text-sm text-muted-foreground">Create the plan, then add stops one by one.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <Label>Plan date *</Label>
          <Input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} />
        </div>
        <div>
          <Label>Territory</Label>
          <Input value={territory} onChange={(e) => setTerritory(e.target.value)} placeholder="e.g. Dhaka North" />
        </div>
        <div className="md:col-span-2">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Morning route — Banani" />
        </div>
        <div className="md:col-span-2">
          <Label>Start location</Label>
          <Input value={startLocation} onChange={(e) => setStartLocation(e.target.value)} placeholder="Office address or starting point" />
        </div>
        <div className="md:col-span-2">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate({ to: "/planning" })}>Cancel</Button>
        <Button onClick={() => create.mutate()} disabled={create.isPending || !planDate}>
          {create.isPending ? "Creating…" : "Create plan"}
        </Button>
      </div>
    </Card>
  );
}
