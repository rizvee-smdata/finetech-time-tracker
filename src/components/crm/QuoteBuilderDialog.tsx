import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import {
  fetchProducts,
  fetchQuoteLineItems,
  replaceQuoteLineItems,
  calcLineTotal,
  calcQuoteTotals,
  type QuoteLineItem,
} from "@/lib/crm/products";
import { formatMoney } from "@/lib/crm/types";
import { fetchApprovalRule, quoteNeedsApproval, logApproval } from "@/lib/crm/approvals";

const sb = supabase as any;


type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadId: string;
  companyId: string;
  userId: string;
  /** when editing existing quote */
  quote?: any | null;
  /** version to use when creating a new quote */
  newVersion?: number;
};

export function QuoteBuilderDialog({ open, onOpenChange, leadId, companyId, userId, quote, newVersion }: Props) {
  const qc = useQueryClient();
  const isEdit = !!quote?.id;

  const products = useQuery({
    queryKey: ["crm-products", companyId],
    queryFn: () => fetchProducts(companyId),
    enabled: open,
  });

  const approvalRule = useQuery({
    queryKey: ["crm-approval-rule", companyId],
    queryFn: () => fetchApprovalRule(companyId),
    enabled: open && !!companyId,
  });

  const existing = useQuery({
    queryKey: ["crm-quote-items", quote?.id],
    queryFn: () => fetchQuoteLineItems(quote.id),
    enabled: open && isEdit,
  });


  const [title, setTitle] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [taxPct, setTaxPct] = useState<number>(0);
  const [discountPct, setDiscountPct] = useState<number>(0);
  const [items, setItems] = useState<QuoteLineItem[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (isEdit) {
      setTitle(quote.title ?? "");
      setValidUntil(quote.valid_until ?? "");
      setNotes(quote.notes ?? "");
      setTaxPct(Number(quote.tax_pct ?? 0));
      setDiscountPct(Number(quote.discount_pct ?? 0));
    } else {
      setTitle(""); setValidUntil(""); setNotes(""); setTaxPct(0); setDiscountPct(0); setItems([]);
    }
  }, [open, isEdit, quote]);

  useEffect(() => {
    if (isEdit && existing.data) setItems(existing.data);
  }, [isEdit, existing.data]);

  const totals = useMemo(() => calcQuoteTotals(items, taxPct, discountPct), [items, taxPct, discountPct]);
  const approvalCheck = useMemo(
    () => quoteNeedsApproval(approvalRule.data, discountPct, totals.total),
    [approvalRule.data, discountPct, totals.total],
  );
  const needsApproval = approvalCheck.needed;


  function addBlank() {
    setItems((cur) => [...cur, { product_id: null, name: "", quantity: 1, unit_price: 0, discount_pct: 0, total: 0, sort_order: cur.length }]);
  }
  function addProduct(productId: string) {
    const p = products.data?.find((x) => x.id === productId);
    if (!p) return;
    setItems((cur) => [...cur, {
      product_id: p.id, name: p.name, quantity: 1, unit_price: Number(p.base_price), discount_pct: 0,
      total: Number(p.base_price), sort_order: cur.length,
    }]);
  }
  function updateItem(i: number, patch: Partial<QuoteLineItem>) {
    setItems((cur) => cur.map((it, idx) => {
      if (idx !== i) return it;
      const merged = { ...it, ...patch };
      merged.total = calcLineTotal(Number(merged.quantity) || 0, Number(merged.unit_price) || 0, Number(merged.discount_pct) || 0);
      return merged;
    }));
  }
  function removeItem(i: number) {
    setItems((cur) => cur.filter((_, idx) => idx !== i));
  }

  async function save(action: "save" | "request_approval" | "send") {
    if (!title.trim()) return toast.error("Title required");
    if (items.length === 0) return toast.error("Add at least one line item");
    setBusy(true);
    try {
      let quoteId = quote?.id;
      const approval_status = action === "request_approval" || needsApproval ? "requested" : "not_requested";

      const basePayload = {
        title: title.trim(),
        valid_until: validUntil || null,
        notes: notes || null,
        tax_pct: taxPct,
        discount_pct: discountPct,
        subtotal: totals.subtotal,
        amount: totals.total,
        approval_status,
        approval_requested_at: approval_status === "requested" ? new Date().toISOString() : null,
        approval_requested_by: approval_status === "requested" ? userId : null,
      };

      if (isEdit) {
        const { error } = await sb.from("crm_quotes").update(basePayload).eq("id", quoteId);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from("crm_quotes").insert({
          ...basePayload,
          lead_id: leadId,
          company_id: companyId,
          created_by: userId,
          version: newVersion ?? 1,
          status: "draft",
        }).select("id").single();
        if (error) throw error;
        quoteId = data.id;
      }

      await replaceQuoteLineItems(quoteId, items);

      if (action === "send") {
        const currentApproval = isEdit ? quote.approval_status : approval_status;
        if (needsApproval && currentApproval !== "approved") {
          toast.error(`Discount ≥ ${APPROVAL_THRESHOLD}% needs approval first`);
        } else {
          const { error } = await sb.from("crm_quotes").update({ status: "sent" }).eq("id", quoteId);
          if (error) throw error;
        }
      }


      qc.invalidateQueries({ queryKey: ["crm-quotes", leadId] });
      qc.invalidateQueries({ queryKey: ["crm-activities", leadId] });
      qc.invalidateQueries({ queryKey: ["crm-quote-items", quoteId] });
      toast.success(isEdit ? "Quote updated" : "Quote created");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Edit quote v${quote.version}` : `New quote v${newVersion ?? 1}`}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="grid gap-1"><Label>Valid until</Label><Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></div>
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line items</Label>
              <div className="flex gap-2">
                <Select onValueChange={addProduct}>
                  <SelectTrigger className="w-56 h-8"><SelectValue placeholder="+ from catalog" /></SelectTrigger>
                  <SelectContent>
                    {(products.data ?? []).length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">No products yet</div>}
                    {(products.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · {formatMoney(p.base_price)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={addBlank}><Plus className="mr-1 h-3 w-3" />Custom</Button>
              </div>
            </div>

            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground">No items. Add from catalog or create a custom line.</p>
            ) : (
              <div className="space-y-2">
                {items.map((it, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center rounded-md border p-2">
                    <Input className="col-span-4 h-8" placeholder="Description" value={it.name} onChange={(e) => updateItem(i, { name: e.target.value })} />
                    <Input className="col-span-2 h-8" type="number" min={0} step="0.01" placeholder="Qty" value={it.quantity} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })} />
                    <Input className="col-span-2 h-8" type="number" min={0} step="0.01" placeholder="Unit $" value={it.unit_price} onChange={(e) => updateItem(i, { unit_price: Number(e.target.value) })} />
                    <Input className="col-span-2 h-8" type="number" min={0} max={100} step="0.1" placeholder="Disc %" value={it.discount_pct} onChange={(e) => updateItem(i, { discount_pct: Number(e.target.value) })} />
                    <div className="col-span-1 text-right text-sm font-medium">{formatMoney(it.total)}</div>
                    <Button size="icon" variant="ghost" className="col-span-1 h-8 w-8 justify-self-end" onClick={() => removeItem(i)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1"><Label>Overall discount %</Label><Input type="number" min={0} max={100} step="0.1" value={discountPct} onChange={(e) => setDiscountPct(Number(e.target.value))} /></div>
            <div className="grid gap-1"><Label>Tax %</Label><Input type="number" min={0} max={100} step="0.1" value={taxPct} onChange={(e) => setTaxPct(Number(e.target.value))} /></div>
          </div>

          <div className="rounded-md bg-muted/40 p-3 text-sm space-y-1">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(totals.subtotal)}</span></div>
            {discountPct > 0 && <div className="flex justify-between text-muted-foreground"><span>After discount ({discountPct}%)</span><span>{formatMoney(totals.afterDiscount)}</span></div>}
            {taxPct > 0 && <div className="flex justify-between text-muted-foreground"><span>Tax ({taxPct}%)</span><span>{formatMoney(totals.tax)}</span></div>}
            <div className="flex justify-between font-semibold text-base pt-1 border-t"><span>Total</span><span>{formatMoney(totals.total)}</span></div>
          </div>

          {needsApproval && (
            <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-2 text-xs">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              <span>Discount of {discountPct}% requires manager approval before sending.</span>
              {isEdit && quote.approval_status && (
                <Badge variant="outline" className="ml-auto capitalize">{String(quote.approval_status).replace("_", " ")}</Badge>
              )}
            </div>
          )}

          <div className="grid gap-1"><Label>Internal notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          {needsApproval ? (
            <Button onClick={() => save("request_approval")} disabled={busy}>Save & request approval</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => save("save")} disabled={busy}>Save draft</Button>
              <Button onClick={() => save("send")} disabled={busy}>Save & send</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
