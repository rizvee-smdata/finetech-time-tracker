import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";
import type { Expense, ExpenseCategory } from "@/lib/expenses/types";
import { CustomFieldsSection } from "@/components/form-builder/CustomFieldsSection";

interface Props {
  initial?: Expense;
  onDone: () => void;
}

export default function ExpenseForm({ initial, onDone }: Props) {
  const { user, companyId } = useAuth();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [categoryId, setCategoryId] = useState<string>(initial?.category_id ?? "");
  const [categoryName, setCategoryName] = useState<string>(initial?.category_name ?? "");
  const [amount, setAmount] = useState<string>(initial ? String(initial.amount) : "");
  const [expenseDate, setExpenseDate] = useState<string>(initial?.expense_date ?? new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState<string>(initial?.description ?? "");
  const [visitId, setVisitId] = useState<string>(initial?.visit_id ?? "");
  const [leadId, setLeadId] = useState<string>(initial?.lead_id ?? "");
  const [receiptPath, setReceiptPath] = useState<string | null>(initial?.receipt_path ?? null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const { data: categories } = useQuery({
    queryKey: ["expense-categories", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("expense_categories")
        .select("*")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("sort_order");
      return (data ?? []) as ExpenseCategory[];
    },
  });

  const { data: leads } = useQuery({
    queryKey: ["expenses-leads-options", user?.id, companyId],
    enabled: !!user && !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("crm_leads")
        .select("id, customer_name, company_name")
        .eq("company_id", companyId!)
        .order("updated_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  const { data: visits } = useQuery({
    queryKey: ["expenses-visits-options", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("customer_visits")
        .select("id, customer_name, meeting_at")
        .eq("user_id", user!.id)
        .order("meeting_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!categoryId && categories && categories.length > 0) {
      setCategoryId(categories[0].id);
      setCategoryName(categories[0].name);
    }
  }, [categories, categoryId]);

  function pickCategory(id: string) {
    setCategoryId(id);
    const c = categories?.find((c) => c.id === id);
    if (c) setCategoryName(c.name);
  }

  async function uploadReceipt(): Promise<string | null> {
    if (!receiptFile || !user) return receiptPath;
    const ext = receiptFile.name.split(".").pop() ?? "jpg";
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("expense-receipts").upload(path, receiptFile);
    if (error) {
      toast.error("Receipt upload failed: " + error.message);
      return receiptPath;
    }
    return path;
  }

  async function save(submitNow = false) {
    if (!user || !companyId) return;
    if (!categoryId || !categoryName) return toast.error("Pick a category");
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter an amount");

    setSaving(true);
    const finalPath = await uploadReceipt();

    const payload = {
      company_id: companyId,
      user_id: user.id,
      category_id: categoryId,
      category_name: categoryName,
      amount: amt,
      currency: "USD",
      expense_date: expenseDate,
      description: description || null,
      visit_id: visitId || null,
      lead_id: leadId || null,
      receipt_path: finalPath,
      status: submitNow ? ("submitted" as const) : ("draft" as const),
      submitted_at: submitNow ? new Date().toISOString() : null,
    };

    if (initial) {
      const { error } = await supabase.from("expenses").update(payload).eq("id", initial.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success(submitNow ? "Submitted for approval" : "Saved");
    } else {
      const { error } = await supabase.from("expenses").insert(payload);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success(submitNow ? "Submitted for approval" : "Draft saved");
    }
    qc.invalidateQueries({ queryKey: ["expenses"] });
    onDone();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card className="p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{initial ? "Edit expense" : "New expense"}</h2>
          <p className="text-sm text-muted-foreground">Amounts in USD.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={pickCategory}>
              <SelectTrigger><SelectValue placeholder="Pick category" /></SelectTrigger>
              <SelectContent>
                {(categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Amount (USD)</Label>
            <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
          </div>
          <div>
            <Label>Linked visit (optional)</Label>
            <Select value={visitId} onValueChange={setVisitId}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">—</SelectItem>
                {(visits ?? []).map((v: { id: string; customer_name: string; meeting_at: string }) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.customer_name} · {new Date(v.meeting_at).toLocaleDateString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Linked lead (optional)</Label>
            <Select value={leadId} onValueChange={setLeadId}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">—</SelectItem>
                {(leads ?? []).map((l: { id: string; customer_name: string; company_name: string | null }) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.customer_name}{l.company_name ? ` · ${l.company_name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Description</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was this for?" />
          </div>

          <div className="sm:col-span-2">
            <Label>Receipt photo</Label>
            <div className="flex items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-muted px-3 py-2 text-sm hover:bg-muted/80">
                <Upload className="h-4 w-4" />
                {receiptFile?.name ?? (receiptPath ? "Replace receipt" : "Upload")}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {(receiptFile || receiptPath) && (
                <Button type="button" variant="ghost" size="sm" onClick={() => { setReceiptFile(null); setReceiptPath(null); }}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
          <Button variant="ghost" onClick={onDone} disabled={saving}>Cancel</Button>
          <Button variant="outline" onClick={() => save(false)} disabled={saving}>Save draft</Button>
          <Button onClick={() => save(true)} disabled={saving}>Submit for approval</Button>
        </div>
      </Card>
    </div>
  );
}
