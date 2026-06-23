import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export type CrmProduct = {
  id: string;
  company_id: string;
  oem_id: string | null;
  name: string;
  description: string | null;
  category: string | null;
  unit: string | null;
  base_price: number;
  is_active: boolean;
};

export async function fetchProducts(companyId: string, oemId?: string | null): Promise<CrmProduct[]> {
  let q = sb
    .from("crm_products")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("name");
  if (oemId) q = q.eq("oem_id", oemId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CrmProduct[];
}

export async function upsertProduct(p: Partial<CrmProduct> & { company_id: string; name: string }) {
  const { error } = await sb.from("crm_products").upsert(p);
  if (error) throw error;
}

export type QuoteLineItem = {
  id?: string;
  quote_id?: string;
  product_id: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  total: number;
  sort_order: number;
};

export async function fetchQuoteLineItems(quoteId: string): Promise<QuoteLineItem[]> {
  const { data, error } = await sb
    .from("crm_quote_line_items")
    .select("*")
    .eq("quote_id", quoteId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as QuoteLineItem[];
}

export async function replaceQuoteLineItems(quoteId: string, items: QuoteLineItem[]) {
  await sb.from("crm_quote_line_items").delete().eq("quote_id", quoteId);
  if (!items.length) return;
  const rows = items.map((it, i) => ({
    quote_id: quoteId,
    product_id: it.product_id,
    name: it.name,
    quantity: it.quantity,
    unit_price: it.unit_price,
    discount_pct: it.discount_pct,
    total: it.total,
    sort_order: i,
  }));
  const { error } = await sb.from("crm_quote_line_items").insert(rows);
  if (error) throw error;
}

export function calcLineTotal(qty: number, unit: number, discount: number) {
  return Math.max(0, qty * unit * (1 - (discount || 0) / 100));
}

export function calcQuoteTotals(
  items: { quantity: number; unit_price: number; discount_pct: number }[],
  taxPct: number,
  overallDiscountPct: number,
) {
  const subtotal = items.reduce((s, it) => s + calcLineTotal(it.quantity, it.unit_price, it.discount_pct), 0);
  const afterDiscount = subtotal * (1 - (overallDiscountPct || 0) / 100);
  const tax = afterDiscount * ((taxPct || 0) / 100);
  const total = afterDiscount + tax;
  return { subtotal, afterDiscount, tax, total };
}
