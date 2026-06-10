import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { STAGES, LEAD_SOURCES, type Lead, type CrmPriority, type CrmLeadSource, type VendorQuote } from "@/lib/crm/types";
import { fetchCompanyMembers } from "@/lib/crm/queries";

const sb = supabase as any;

export function LeadFormDialog({
  open, onOpenChange, lead,
}: { open: boolean; onOpenChange: (o: boolean) => void; lead?: Lead | null }) {
  const { user, companyId } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({});

  const members = useQuery({
    queryKey: ["crm-members", companyId],
    enabled: !!companyId && open,
    queryFn: () => fetchCompanyMembers(companyId!),
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      customer_name: lead?.customer_name ?? "",
      company_name: lead?.company_name ?? "",
      contact_person: lead?.contact_person ?? "",
      designation: lead?.designation ?? "",
      phone: lead?.phone ?? "",
      email: lead?.email ?? "",
      location: lead?.location ?? "",
      stage: lead?.stage ?? "new",
      priority: lead?.priority ?? "medium",
      lead_source: lead?.lead_source ?? "manual",
      assigned_to: lead?.assigned_to ?? user?.id ?? "",
      expected_value: lead?.expected_value ?? "",
      probability: lead?.probability ?? 10,
      expected_close_date: lead?.expected_close_date ?? "",
      notes: lead?.notes ?? "",
      lost_reason: lead?.lost_reason ?? "",
      competitor_name: lead?.competitor_name ?? "",
      competitor_price: lead?.competitor_price ?? "",
      competitor_notes: lead?.competitor_notes ?? "",
      renewal_kind: lead?.renewal_kind ?? "one_time",
      renewal_date: lead?.renewal_date ?? "",
    });
  }, [open, lead, user?.id]);

  async function save() {
    if (!user || !companyId) return toast.error("Select a company first");
    if (!form.customer_name?.trim()) return toast.error("Customer name required");
    setBusy(true);
    const payload: any = {
      customer_name: form.customer_name.trim(),
      company_name: form.company_name || null,
      contact_person: form.contact_person || null,
      designation: form.designation || null,
      phone: form.phone || null,
      email: form.email || null,
      location: form.location || null,
      stage: form.stage,
      priority: form.priority as CrmPriority,
      lead_source: form.lead_source as CrmLeadSource,
      assigned_to: form.assigned_to || null,
      expected_value: form.expected_value === "" ? null : Number(form.expected_value),
      probability: Number(form.probability) || 0,
      expected_close_date: form.expected_close_date || null,
      notes: form.notes || null,
      lost_reason: form.stage === "lost" ? form.lost_reason || null : null,
      competitor_name: form.competitor_name || null,
      competitor_price: form.competitor_price === "" ? null : Number(form.competitor_price),
      competitor_notes: form.competitor_notes || null,
      renewal_kind: form.renewal_kind,
      renewal_date: form.renewal_kind !== "one_time" ? form.renewal_date || null : null,
    };
    const { error } = lead
      ? await sb.from("crm_leads").update(payload).eq("id", lead.id)
      : await sb.from("crm_leads").insert({ ...payload, company_id: companyId, created_by: user.id, source: "manual" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(lead ? "Lead updated" : "Lead created");
    qc.invalidateQueries({ queryKey: ["crm-leads"] });
    qc.invalidateQueries({ queryKey: ["crm-lead", lead?.id] });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lead ? "Edit lead" : "New lead"}</DialogTitle>
          <DialogDescription>Track a prospect through your pipeline.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Customer name *">
              <Input value={form.customer_name || ""} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
            </Field>
            <Field label="Company">
              <Input value={form.company_name || ""} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
            </Field>
            <Field label="Contact person">
              <Input value={form.contact_person || ""} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
            </Field>
            <Field label="Designation">
              <Input value={form.designation || ""} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Location">
              <Input value={form.location || ""} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </Field>
            <Field label="Stage">
              <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Assigned to">
              <Select value={form.assigned_to || ""} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {(members.data ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Expected value ($)">
              <Input type="number" value={form.expected_value ?? ""} onChange={(e) => setForm({ ...form, expected_value: e.target.value })} />
            </Field>
            <Field label="Probability (%)">
              <Input type="number" min={0} max={100} value={form.probability ?? 0} onChange={(e) => setForm({ ...form, probability: e.target.value })} />
            </Field>
            <Field label="Expected close date">
              <Input type="date" value={form.expected_close_date || ""} onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })} />
            </Field>
            <Field label="Priority">
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Lead source">
              <Select value={form.lead_source} onValueChange={(v) => setForm({ ...form, lead_source: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_SOURCES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Deal type">
              <Select value={form.renewal_kind} onValueChange={(v) => setForm({ ...form, renewal_kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_time">One-Time</SelectItem>
                  <SelectItem value="amc">AMC</SelectItem>
                  <SelectItem value="subscription">Subscription</SelectItem>
                  <SelectItem value="retainer">Retainer</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {form.renewal_kind !== "one_time" && (
              <Field label="Renewal date">
                <Input type="date" value={form.renewal_date || ""} onChange={(e) => setForm({ ...form, renewal_date: e.target.value })} />
              </Field>
            )}
          </div>

          <div className="rounded-md border p-3">
            <div className="mb-2 text-xs font-semibold text-muted-foreground">Competitor (optional)</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Competitor name">
                <Input value={form.competitor_name || ""} onChange={(e) => setForm({ ...form, competitor_name: e.target.value })} />
              </Field>
              <Field label="Their price ($)">
                <Input type="number" value={form.competitor_price ?? ""} onChange={(e) => setForm({ ...form, competitor_price: e.target.value })} />
              </Field>
            </div>
            <div className="mt-2">
              <Field label="Notes">
                <Textarea rows={2} value={form.competitor_notes || ""} onChange={(e) => setForm({ ...form, competitor_notes: e.target.value })} />
              </Field>
            </div>
          </div>

          <Field label="Notes">
            <Textarea rows={3} value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>

          {form.stage === "lost" && (
            <Field label="Lost reason">
              <Textarea rows={2} value={form.lost_reason || ""} onChange={(e) => setForm({ ...form, lost_reason: e.target.value })} />
            </Field>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
