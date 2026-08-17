import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { STAGES, LEAD_SOURCES, type Lead, type CrmPriority, type CrmLeadSource, type VendorQuote } from "@/lib/crm/types";
import { fetchAssignableMembers } from "@/lib/crm/queries";
import { fetchOems } from "@/lib/crm/oems";
import { fetchProducts } from "@/lib/crm/products";
import { fetchPartners } from "@/lib/crm/partners";
import { fetchCustomFieldDefs } from "@/lib/crm/customFields";
import { CustomFieldsSection } from "@/components/form-builder/CustomFieldsSection";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

type CustomerOption = {
  id: string;
  customer_name: string;
  contact_person: string | null;
  designation: string | null;
  email: string | null;
  phone: string | null;
};

/** Searchable customer picker — handles thousands of rows without truncation. */
function CustomerCombobox({
  value,
  options,
  onTextChange,
  onPick,
}: {
  value: string;
  options: CustomerOption[];
  onTextChange: (v: string) => void;
  onPick: (c: CustomerOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = (q
    ? options.filter((c) =>
        [c.customer_name, c.contact_person, c.email, c.phone]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(q)),
      )
    : options
  ).slice(0, 200);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setQuery(value); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className={cn("w-full justify-between font-normal", !value && "text-muted-foreground")}
        >
          <span className="truncate">{value || "Start typing — pick existing or add new"}</span>
          <ChevronDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search customers…" value={query} onValueChange={setQuery} />
          <CommandList className="max-h-72">
            <CommandEmpty className="py-3 px-3 text-sm">
              {query.trim() ? (
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => { onTextChange(query.trim()); setOpen(false); }}
                >
                  Use “{query.trim()}” as a new customer
                </button>
              ) : (
                "No customers yet."
              )}
            </CommandEmpty>
            <CommandGroup>
              {query.trim() && !options.some((c) => c.customer_name.toLowerCase() === q) && (
                <CommandItem
                  value={`__new__${query}`}
                  onSelect={() => { onTextChange(query.trim()); setOpen(false); }}
                >
                  Use “{query.trim()}” as a new customer
                </CommandItem>
              )}
              {filtered.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => { onPick(c); setOpen(false); }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm">{c.customer_name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[c.contact_person, c.email, c.phone].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const sb = supabase as any;


export function LeadFormDialog({
  open, onOpenChange, lead,
}: { open: boolean; onOpenChange: (o: boolean) => void; lead?: Lead | null }) {
  const { user, companyId } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({});

  const members = useQuery({
    queryKey: ["crm-assignable-members", companyId],
    enabled: !!companyId && open,
    queryFn: () => fetchAssignableMembers(companyId!),
    refetchOnMount: "always",
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
      product_name: lead?.product_name ?? "",
      oem_id: (lead as any)?.oem_id ?? "",
      product_id: (lead as any)?.product_id ?? "",
      product_ids: Array.isArray((lead as any)?.product_ids) && (lead as any).product_ids.length
        ? (lead as any).product_ids as string[]
        : ((lead as any)?.product_id ? [(lead as any).product_id as string] : []),
      partner_id: (lead as any)?.partner_id ?? "",
      vendor_quotes: (lead?.vendor_quotes ?? []) as VendorQuote[],
      custom_fields: ((lead as any)?.custom_fields ?? {}) as Record<string, unknown>,
    });
  }, [open, lead, user?.id]);

  const customFieldDefs = useQuery({
    queryKey: ["crm-custom-fields-active", companyId],
    enabled: !!companyId && open,
    queryFn: () => fetchCustomFieldDefs(companyId!, { activeOnly: true }),
  });

  const oems = useQuery({
    queryKey: ["crm-oems", companyId],
    queryFn: () => fetchOems(companyId!),
    enabled: !!companyId && open,
  });
  const products = useQuery({
    queryKey: ["crm-products", companyId, form.oem_id],
    queryFn: () => fetchProducts(companyId!, form.oem_id || null),
    enabled: !!companyId && open,
  });
  const partners = useQuery({
    queryKey: ["crm-partners", companyId],
    queryFn: () => fetchPartners(companyId!),
    enabled: !!companyId && open,
  });
  const customers = useQuery({
    queryKey: ["crm-customers-suggest", companyId],
    enabled: !!companyId && open,
    queryFn: async () => {
      // Page through so large customer lists are never truncated (the old
      // 500-row cap silently dropped names late in the alphabet).
      const page = 1000;
      let from = 0;
      const all: any[] = [];
      for (;;) {
        const { data, error } = await sb
          .from("customers")
          .select("id, customer_name, contact_person, designation, email, phone")
          .eq("company_id", companyId)
          .eq("kind", "customer")
          .is("deleted_at", null)
          .order("customer_name")
          .range(from, from + page - 1);
        if (error) throw error;
        all.push(...(data ?? []));
        if (!data || data.length < page) break;
        from += page;
      }
      return all as Array<{ id: string; customer_name: string; contact_person: string | null; designation: string | null; email: string | null; phone: string | null }>;
    },
  });

  const accounts = useQuery({
    queryKey: ["crm-accounts-suggest", companyId],
    enabled: !!companyId && open,
    queryFn: async () => {
      const { data, error } = await sb
        .from("crm_accounts")
        .select("id, name")
        .eq("company_id", companyId)
        .order("name")
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  async function save() {
    if (!user || !companyId) return toast.error("Select a company first");
    if (!form.customer_name?.trim()) return toast.error("Customer name required");
    // Validate custom fields
    const defs = customFieldDefs.data ?? [];
    const cfIn = (form.custom_fields ?? {}) as Record<string, unknown>;
    const cfOut: Record<string, unknown> = {};
    for (const d of defs) {
      const raw = cfIn[d.field_key];
      const str = raw == null ? "" : String(raw).trim();
      if (d.is_required && str === "") {
        return toast.error(`${d.label} is required`);
      }
      if (str === "") continue;
      if (d.field_type === "number") {
        const n = Number(str);
        if (!Number.isFinite(n)) return toast.error(`${d.label} must be a number`);
        cfOut[d.field_key] = n;
      } else {
        cfOut[d.field_key] = str;
      }
    }
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
      product_name: (() => {
        const ids: string[] = form.product_ids ?? [];
        const list = products.data ?? [];
        const names = ids
          .map((id) => list.find((p: any) => p.id === id)?.name)
          .filter(Boolean) as string[];
        if (names.length) return names.join(", ");
        return form.product_name?.trim() || null;
      })(),
      oem_id: form.oem_id || null,
      product_id: (form.product_ids && form.product_ids[0]) || form.product_id || null,
      product_ids: form.product_ids ?? [],
      partner_id: form.partner_id || null,
      vendor_quotes: (form.vendor_quotes ?? [])
        .filter((v: VendorQuote) => v.vendor?.trim())
        .map((v: VendorQuote) => ({
          vendor: v.vendor.trim(),
          price: v.price === null || v.price === undefined || (v.price as any) === "" ? null : Number(v.price),
          currency: v.currency || form.currency || "USD",
          notes: v.notes || null,
        })),
      custom_fields: cfOut,
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
              <CustomerCombobox
                value={form.customer_name || ""}
                options={customers.data ?? []}
                onTextChange={(v) => setForm((f: any) => ({ ...f, customer_name: v }))}
                onPick={(c) =>
                  setForm((f: any) => ({
                    ...f,
                    customer_name: c.customer_name,
                    contact_person: c.contact_person || "",
                    designation: c.designation || "",
                    email: c.email || "",
                    phone: c.phone || "",
                  }))
                }
              />
            </Field>

            <Field label="Company">
              <Input
                list="lead-company-suggestions"
                value={form.company_name || ""}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                placeholder="Start typing — pick existing or add new"
              />
              <datalist id="lead-company-suggestions">
                {(accounts.data ?? []).map((a) => (
                  <option key={a.id} value={a.name} />
                ))}
              </datalist>
            </Field>
            <Field label="OEM / Vendor">
              <Select
                value={form.oem_id || "__none"}
                onValueChange={(v) => setForm({ ...form, oem_id: v === "__none" ? "" : v, product_id: "", product_ids: [], product_name: "" })}
              >
                <SelectTrigger><SelectValue placeholder="Select OEM" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— None —</SelectItem>
                  {(oems.data ?? []).map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Products">
              {(() => {
                const selected: string[] = form.product_ids ?? [];
                const list = (products.data ?? []) as Array<{ id: string; name: string }>;
                const selectedItems = selected
                  .map((id) => list.find((p) => p.id === id))
                  .filter(Boolean) as Array<{ id: string; name: string }>;
                function toggle(id: string) {
                  const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
                  setForm({ ...form, product_ids: next, product_id: next[0] ?? "" });
                }
                return (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex min-h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-left hover:bg-accent/40"
                      >
                        <div className="flex flex-wrap gap-1">
                          {selectedItems.length === 0 ? (
                            <span className="text-muted-foreground">
                              {form.oem_id ? "Select products (one or more)" : "Select OEM first or any product"}
                            </span>
                          ) : (
                            selectedItems.map((p) => (
                              <Badge key={p.id} variant="secondary" className="gap-1">
                                {p.name}
                                <X
                                  className="h-3 w-3 cursor-pointer"
                                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggle(p.id); }}
                                />
                              </Badge>
                            ))
                          )}
                        </div>
                        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-1 max-h-64 overflow-auto">
                      {list.length === 0 && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">No products.</div>
                      )}
                      {list.map((p) => (
                        <label
                          key={p.id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm"
                        >
                          <Checkbox
                            checked={selected.includes(p.id)}
                            onCheckedChange={() => toggle(p.id)}
                          />
                          <span>{p.name}</span>
                        </label>
                      ))}
                    </PopoverContent>
                  </Popover>
                );
              })()}
              <div className="text-[11px] text-muted-foreground mt-1">Tip: pick multiple to bundle (e.g. GWS Business Starter + Gemini Enterprise).</div>
            </Field>
            <Field label="Partner (optional)">
              <Select
                value={form.partner_id || "__none"}
                onValueChange={(v) => setForm({ ...form, partner_id: v === "__none" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="Did a partner bring this lead?" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— No partner —</SelectItem>
                  {(partners.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

          <div className="rounded-md border p-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-muted-foreground">Vendor budget comparison</div>
                <div className="text-[11px] text-muted-foreground">List other vendors quoting for the same {form.product_name?.trim() ? `"${form.product_name}"` : "product / service"}.</div>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => setForm({ ...form, vendor_quotes: [...(form.vendor_quotes ?? []), { vendor: "", price: null, currency: "USD", notes: "" }] })}>
                + Add vendor
              </Button>
            </div>
            {(form.vendor_quotes ?? []).length === 0 && (
              <div className="text-xs text-muted-foreground">No competing vendor quotes yet.</div>
            )}
            <div className="space-y-2">
              {(form.vendor_quotes ?? []).map((v: VendorQuote, i: number) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1.2fr_0.8fr_0.6fr_1.4fr_auto] items-start">
                  <Input placeholder="Vendor name" value={v.vendor} onChange={(e) => {
                    const arr = [...form.vendor_quotes]; arr[i] = { ...v, vendor: e.target.value }; setForm({ ...form, vendor_quotes: arr });
                  }} />
                  <Input type="number" placeholder="Quoted price" value={v.price ?? ""} onChange={(e) => {
                    const arr = [...form.vendor_quotes]; arr[i] = { ...v, price: e.target.value === "" ? null : Number(e.target.value) }; setForm({ ...form, vendor_quotes: arr });
                  }} />
                  <Select value={v.currency ?? "USD"} onValueChange={(val) => {
                    const arr = [...form.vendor_quotes]; arr[i] = { ...v, currency: val }; setForm({ ...form, vendor_quotes: arr });
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="BDT">BDT</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input placeholder="Notes (terms, validity, scope)" value={v.notes ?? ""} onChange={(e) => {
                    const arr = [...form.vendor_quotes]; arr[i] = { ...v, notes: e.target.value }; setForm({ ...form, vendor_quotes: arr });
                  }} />
                  <Button type="button" size="sm" variant="ghost" onClick={() => {
                    const arr = [...form.vendor_quotes]; arr.splice(i, 1); setForm({ ...form, vendor_quotes: arr });
                  }}>✕</Button>
                </div>
              ))}
            </div>
            {(form.vendor_quotes ?? []).filter((v: VendorQuote) => typeof v.price === "number").length >= 1 && form.expected_value && (
              <div className="mt-2 text-[11px] text-muted-foreground">
                Your price: <span className="font-medium text-foreground">{Number(form.expected_value).toLocaleString()}</span>
                {" · "}Lowest vendor: <span className="font-medium text-foreground">
                  {Math.min(...form.vendor_quotes.filter((v: VendorQuote) => typeof v.price === "number").map((v: VendorQuote) => v.price as number)).toLocaleString()}
                </span>
              </div>
            )}
          </div>

          
           {(customFieldDefs.data ?? []).length > 0 && (
            <div className="rounded-md border p-3">
              <div className="mb-2 text-xs font-semibold text-muted-foreground">Custom lead fields</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {(customFieldDefs.data ?? []).map((d) => (
                  <Field key={d.id} label={`${d.label}${d.is_required ? " *" : ""}`}>
                    <Input
                      type={d.field_type === "number" ? "number" : "text"}
                      value={(() => {
                        const v = ((form.custom_fields ?? {}) as Record<string, unknown>)[d.field_key];
                        return v == null ? "" : String(v);
                      })()}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          custom_fields: {
                            ...((form.custom_fields ?? {}) as Record<string, unknown>),
                            [d.field_key]: e.target.value,
                          },
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
            </div>
          )}

          {companyId && (
            <CustomFieldsSection
              companyId={companyId}
              entity="lead"
              values={(form.custom_fields ?? {}) as Record<string, unknown>}
              onChange={(next: Record<string, unknown>) => setForm({ ...form, custom_fields: next })}
              members={(members.data ?? []).map((m: any) => ({
                id: m.id,
                label: m.full_name || m.email || m.id,
              }))}
            />
          )}

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
