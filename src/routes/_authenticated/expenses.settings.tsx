import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { ExpenseCategory } from "@/lib/expenses/types";

export const Route = createFileRoute("/_authenticated/expenses/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { companyId, isStaff } = useAuth();
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newLimit, setNewLimit] = useState("");

  const { data: categories } = useQuery({
    queryKey: ["expense-categories-all", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase.from("expense_categories").select("*").eq("company_id", companyId!).order("sort_order");
      return (data ?? []) as ExpenseCategory[];
    },
  });

  const { data: members } = useQuery({
    queryKey: ["company-members", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data: cm } = await supabase.from("company_members").select("user_id").eq("company_id", companyId!);
      const ids = (cm ?? []).map((m) => m.user_id);
      if (ids.length === 0) return [];
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      return profs ?? [];
    },
  });

  const { data: assignments } = useQuery({
    queryKey: ["expense-approvers", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase.from("expense_approver_assignments").select("*").eq("company_id", companyId!);
      return data ?? [];
    },
  });

  async function addCategory() {
    if (!newName.trim() || !companyId) return;
    const { error } = await supabase.from("expense_categories").insert({
      company_id: companyId,
      name: newName.trim(),
      auto_approve_limit: newLimit ? Number(newLimit) : null,
      sort_order: (categories?.length ?? 0) + 1,
    });
    if (error) return toast.error(error.message);
    setNewName(""); setNewLimit("");
    qc.invalidateQueries({ queryKey: ["expense-categories"] });
    qc.invalidateQueries({ queryKey: ["expense-categories-all"] });
  }

  async function removeCategory(id: string) {
    if (!confirm("Delete this category?")) return;
    const { error } = await supabase.from("expense_categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["expense-categories-all"] });
  }

  async function setApprover(repId: string, approverId: string) {
    if (!companyId) return;
    if (!approverId || approverId === "__none__") {
      await supabase.from("expense_approver_assignments").delete().eq("company_id", companyId).eq("rep_id", repId);
    } else {
      const existing = assignments?.find((a) => a.rep_id === repId);
      if (existing) {
        await supabase.from("expense_approver_assignments").update({ approver_id: approverId }).eq("id", existing.id);
      } else {
        await supabase.from("expense_approver_assignments").insert({ company_id: companyId, rep_id: repId, approver_id: approverId });
      }
    }
    qc.invalidateQueries({ queryKey: ["expense-approvers"] });
    toast.success("Saved");
  }

  if (!isStaff) return <div className="text-sm text-muted-foreground">Admins and managers only.</div>;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold">Expense categories</h3>
        <div className="space-y-2">
          {(categories ?? []).map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-md border p-2">
              <div>
                <div className="text-sm font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground">
                  {c.auto_approve_limit ? `Auto-approve under USD ${Number(c.auto_approve_limit).toLocaleString()}` : "No auto-approve"}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => removeCategory(c.id)}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 border-t pt-3">
          <div className="col-span-2">
            <Label className="text-xs">New category</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Transport" />
          </div>
          <div>
            <Label className="text-xs">Auto-approve under</Label>
            <Input type="number" value={newLimit} onChange={(e) => setNewLimit(e.target.value)} placeholder="USD" />
          </div>
        </div>
        <Button size="sm" onClick={addCategory} disabled={!newName.trim()}>
          <Plus className="mr-1 h-4 w-4" /> Add category
        </Button>
      </Card>

      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold">Approver assignments</h3>
        <p className="text-xs text-muted-foreground">Pick which manager reviews each rep's expenses.</p>
        <div className="space-y-2">
          {(members ?? []).map((m) => {
            const assigned = assignments?.find((a) => a.rep_id === m.id);
            return (
              <div key={m.id} className="flex items-center gap-2">
                <div className="flex-1 truncate text-sm">{m.full_name ?? m.email}</div>
                <Select value={assigned?.approver_id ?? "__none__"} onValueChange={(v) => setApprover(m.id, v)}>
                  <SelectTrigger className="h-8 w-48"><SelectValue placeholder="No approver" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No approver</SelectItem>
                    {(members ?? []).filter((u) => u.id !== m.id).map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
