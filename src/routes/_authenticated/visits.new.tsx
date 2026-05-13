import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { toast } from "sonner";
import { ArrowLeft, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

type ContactType = "customer" | "partner" | "consultant";
const TYPE_LABELS: Record<ContactType, { singular: string; plural: string }> = {
  customer: { singular: "Customer", plural: "customers" },
  partner: { singular: "Partner", plural: "partners" },
  consultant: { singular: "Consultant", plural: "consultants" },
};

export const Route = createFileRoute("/_authenticated/visits/new")({
  component: NewVisit,
});

const schema = z.object({
  customer_name: z.string().trim().min(1).max(120),
  designation: z.string().trim().max(120).optional().or(z.literal("")),
  email: z.string().trim().max(160).email().optional().or(z.literal("")),
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
  const { user, companyId, company } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contactType, setContactType] = useState<ContactType>("customer");
  const [form, setForm] = useState({
    customer_name: "", designation: "", email: "", company: "", contact_number: "", location: "",
    meeting_at: new Date().toISOString().slice(0, 16),
    discussion_summary: "", next_action: "", next_meeting_at: "", remarks: "",
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts-picker", companyId, contactType],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, customer_name, contact_person, designation, email, phone")
        .eq("company_id", companyId!)
        .eq("kind", contactType)
        .order("customer_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  function pickCustomer(c: any) {
    setSelectedId(c.id);
    setForm((f) => ({
      ...f,
      customer_name: c.contact_person || c.customer_name,
      designation: c.designation || f.designation,
      email: c.email || f.email,
      company: c.customer_name || f.company,
      contact_number: c.phone || f.contact_number,
    }));
    setPickerOpen(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) {
      toast.error("Select a company first");
      return;
    }
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    const payload = {
      user_id: user!.id,
      company_id: companyId,
      customer_name: form.customer_name.trim(),
      designation: form.designation.trim() || null,
      email: form.email.trim() || null,
      company: form.company.trim() || null,
      contact_number: form.contact_number.trim() || null,
      location: form.location.trim() || null,
      meeting_at: new Date(form.meeting_at).toISOString(),
      discussion_summary: form.discussion_summary.trim() || null,
      next_action: form.next_action.trim() || null,
      next_meeting_at: form.next_meeting_at ? new Date(form.next_meeting_at).toISOString() : null,
      remarks: form.remarks.trim() || null,
    };
    const { error } = await supabase.from("customer_visits").insert({ ...payload, contact_type: contactType });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Visit saved");
    nav({ to: "/visits" });
  }

  const selected = contacts.find((c: any) => c.id === selectedId);
  const typeLabel = TYPE_LABELS[contactType];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => nav({ to: "/visits" })}>
        <ArrowLeft className="mr-2 h-4 w-4" />Back
      </Button>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New visit report</h1>
        <p className="text-sm text-muted-foreground">
          Logging visit for <span className="font-medium text-foreground">{company?.name ?? "—"}</span>.
        </p>
      </div>

      <Card className="p-6">
        <form onSubmit={submit} className="space-y-5">
          <Field label="Select customer (from imported list)" id="customer_picker">
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal"
                >
                  {selected
                    ? `${selected.customer_name}${selected.contact_person ? ` — ${selected.contact_person}` : ""}`
                    : customers.length
                      ? "Search and pick a customer..."
                      : "No imported customers — fill details below"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search customers..." />
                  <CommandList>
                    <CommandEmpty>No customer found.</CommandEmpty>
                    <CommandGroup>
                      {customers.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={`${c.customer_name} ${c.contact_person ?? ""} ${c.email ?? ""} ${c.phone ?? ""}`}
                          onSelect={() => pickCustomer(c)}
                        >
                          <Check className={cn("mr-2 h-4 w-4", selectedId === c.id ? "opacity-100" : "opacity-0")} />
                          <div className="flex flex-col">
                            <span className="font-medium">{c.customer_name}</span>
                            <span className="text-xs text-muted-foreground">
                              {[c.contact_person, c.designation, c.phone].filter(Boolean).join(" · ") || "—"}
                            </span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contact / customer name *" id="customer_name">
              <Input id="customer_name" required value={form.customer_name} onChange={set("customer_name")} />
            </Field>
            <Field label="Company" id="company">
              <Input id="company" value={form.company} onChange={set("company")} />
            </Field>
            <Field label="Designation" id="designation">
              <Input id="designation" value={form.designation} onChange={set("designation")} placeholder="e.g. Purchase Manager" />
            </Field>
            <Field label="Email" id="email">
              <Input id="email" type="email" value={form.email} onChange={set("email")} placeholder="name@company.com" />
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
