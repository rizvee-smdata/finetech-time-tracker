import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { fetchProducts, type CrmProduct } from "@/lib/crm/products";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/crm/types";
import { fetchOems } from "@/lib/crm/oems";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/crm/catalog")({
  component: CatalogPage,
});

function CatalogPage() {
  const { companyId } = useAuth();
  const cid = companyId;

  const products = useQuery({
    queryKey: ["crm-products", cid],
    queryFn: () => fetchProducts(cid!),
    enabled: !!cid,
  });

  const [editing, setEditing] = useState<CrmProduct | null>(null);
  const [open, setOpen] = useState(false);

  if (!cid) return <p className="text-sm text-muted-foreground">Select a company to manage catalog.</p>;


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Product Catalog</h2>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />New product
        </Button>
      </div>

      {(products.data ?? []).length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No products yet. Add your first product to use it in quotes.</Card>
      ) : (
        <div className="grid gap-2">
          {(products.data ?? []).map((p) => (
            <Card key={p.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="text-sm text-muted-foreground">
                  {(p as any).oem_name && <span className="mr-1">{(p as any).oem_name} ·</span>}
                  {formatMoney(p.base_price)} / {p.unit || "each"}
                  {p.category && <> · {p.category}</>}
                </div>
                {p.description && <p className="text-xs text-muted-foreground mt-1">{p.description}</p>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setEditing(p); setOpen(true); }}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="outline" onClick={async () => {
                  if (!window.confirm("Delete this product?")) return;
                  const { error } = await sb.from("crm_products").update({ is_active: false }).eq("id", p.id);
                  if (error) return toast.error(error.message);
                  toast.success("Product removed");
                  products.refetch();
                }}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ProductDialog key={editing?.id ?? "new"} open={open} onOpenChange={setOpen} companyId={cid} product={editing} onSaved={() => products.refetch()} />
    </div>
  );
}

function ProductDialog({ open, onOpenChange, companyId, product, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; companyId: string; product: CrmProduct | null; onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(product?.name ?? "");
  const [oemId, setOemId] = useState<string>(product?.oem_id ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [unit, setUnit] = useState(product?.unit ?? "each");
  const [price, setPrice] = useState<string>(String(product?.base_price ?? 0));
  const [description, setDescription] = useState(product?.description ?? "");
  const [busy, setBusy] = useState(false);

  const oems = useQuery({
    queryKey: ["crm-oems", companyId],
    queryFn: () => fetchOems(companyId),
    enabled: !!companyId && open,
  });

  async function save() {
    if (!name.trim()) return toast.error("Name required");
    setBusy(true);
    const payload = {
      company_id: companyId,
      oem_id: oemId || null,
      name: name.trim(),
      category: category || null,
      unit: unit || "each",
      base_price: Number(price) || 0,
      description: description || null,
      is_active: true,
    };
    const op = product
      ? sb.from("crm_products").update(payload).eq("id", product.id)
      : sb.from("crm_products").insert(payload);
    const { error } = await op;
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["crm-products", companyId] });
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{product ? "Edit product" : "New product"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label>OEM / Vendor</Label>
              <Select value={oemId || "__none"} onValueChange={(v) => setOemId(v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select OEM" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— None —</SelectItem>
                  {(oems.data ?? []).map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1"><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1"><Label>Price</Label><Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
            <div className="grid gap-1"><Label>Unit</Label><Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="each, hr, license" /></div>
            <div className="grid gap-1"><Label>Category</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} /></div>
          </div>
          <div className="grid gap-1"><Label>Description</Label><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
