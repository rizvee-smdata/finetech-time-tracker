import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/visits/new")({
  component: NewVisit,
});

const schema = z.object({
  customer_name: z.string().trim().min(1).max(120),
  company: z.string().trim().max(120).optional().or(z.literal("")),
  contact_number: z.string().trim().max(40).optional().or(z.literal("")),
  location: z.string().trim().max(200).optional().or(z.literal("")),
  meeting_at: z.string().min(1),
  discussion_summary: z.string().max(2000).optional().or(z.literal("")),
  next_action: z.string().max(1000).optional().or(z.literal("")),
  next_meeting_at: z.string().optional().or(z.literal("")),
  remarks: z.string().max(1000).optional().or(z.literal("")),
});

function NewVisit() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    customer_name: "", company: "", contact_number: "", location: "",
    meeting_at: new Date().toISOString().slice(0, 16),
    discussion_summary: "", next_action: "", next_meeting_at: "", remarks: "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    const payload = {
      user_id: user!.id,
      customer_name: form.customer_name.trim(),
      company: form.company.trim() || null,
      contact_number: form.contact_number.trim() || null,
      location: form.location.trim() || null,
      meeting_at: new Date(form.meeting_at).toISOString(),
      discussion_summary: form.discussion_summary.trim() || null,
      next_action: form.next_action.trim() || null,
      next_meeting_at: form.next_meeting_at ? new Date(form.next_meeting_at).toISOString() : null,
      remarks: form.remarks.trim() || null,
    };
    const { error } = await supabase.from("customer_visits").insert(payload);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Visit saved");
    nav({ to: "/visits" });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => nav({ to: "/visits" })}>
        <ArrowLeft className="mr-2 h-4 w-4" />Back
      </Button>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New visit report</h1>
        <p className="text-sm text-muted-foreground">Log a customer visit and plan the next step.</p>
      </div>

      <Card className="p-6">
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer name *" id="customer_name">
              <Input id="customer_name" required value={form.customer_name} onChange={set("customer_name")} />
            </Field>
            <Field label="Company" id="company">
              <Input id="company" value={form.company} onChange={set("company")} />
            </Field>
            <Field label="Contact number" id="contact_number">
              <Input id="contact_number" value={form.contact_number} onChange={set("contact_number")} />
            </Field>
            <Field label="Location" id="location">
              <Input id="location" value={form.location} onChange={set("location")} placeholder="City / address" />
            </Field>
            <Field label="Meeting date & time *" id="meeting_at">
              <Input id="meeting_at" type="datetime-local" required value={form.meeting_at} onChange={set("meeting_at")} />
            </Field>
            <Field label="Next meeting" id="next_meeting_at">
              <Input id="next_meeting_at" type="datetime-local" value={form.next_meeting_at} onChange={set("next_meeting_at")} />
            </Field>
          </div>

          <Field label="Discussion summary / outcome" id="discussion_summary">
            <Textarea id="discussion_summary" rows={4} value={form.discussion_summary} onChange={set("discussion_summary")} placeholder="What was discussed and the result of the visit." />
          </Field>
          <Field label="Next action / follow-up" id="next_action">
            <Textarea id="next_action" rows={3} value={form.next_action} onChange={set("next_action")} placeholder="Follow-up steps, tasks, scheduled activities." />
          </Field>
          <Field label="Remarks" id="remarks">
            <Textarea id="remarks" rows={2} value={form.remarks} onChange={set("remarks")} placeholder="Important notes, observations, special requirements." />
          </Field>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => nav({ to: "/visits" })}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving..." : "Save visit"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
