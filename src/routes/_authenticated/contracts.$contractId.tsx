import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2, FileText, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  CONTRACT_STATUS_META, CONTRACT_TYPE_LABEL, PAYMENT_STATUS_META, formatBDT,
  type Contract, type Milestone, type PaymentStatus, type ContractStatus,
} from "@/lib/contracts/types";

export const Route = createFileRoute("/_authenticated/contracts/$contractId")({
  component: ContractDetail,
});

function ContractDetail() {
  const { contractId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const contract = useQuery({
    queryKey: ["contract", contractId],
    queryFn: async () => {
      const { data, error } = await supabase.from("contracts").select("*").eq("id", contractId).maybeSingle();
      if (error) throw error;
      return data as Contract | null;
    },
  });

  const payments = useQuery({
    queryKey: ["contract-payments", contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_payments").select("*").eq("contract_id", contractId).order("due_date");
      if (error) throw error;
      return (data ?? []) as Milestone[];
    },
  });

  const updateContract = useMutation({
    mutationFn: async (patch: Partial<Contract>) => {
      const { error } = await supabase.from("contracts").update(patch).eq("id", contractId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contract", contractId] }),
  });

  const delContract = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("contracts").delete().eq("id", contractId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Contract deleted"); navigate({ to: "/contracts" }); },
    onError: (e: any) => toast.error(e.message),
  });

  const setPayStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PaymentStatus }) => {
      const patch: any = { status };
      if (status === "received") patch.received_at = new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from("contract_payments").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contract-payments", contractId] }),
  });

  const delPay = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contract_payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contract-payments", contractId] }),
  });

  if (contract.isLoading) return <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>;
  if (!contract.data) return <Card className="p-6 text-sm text-muted-foreground">Not found.</Card>;

  const c = contract.data;
  const meta = CONTRACT_STATUS_META[c.status];
  const ms = payments.data ?? [];
  const received = ms.filter((m) => m.status === "received").reduce((s, m) => s + Number(m.amount), 0);
  const outstanding = Number(c.total_value) - received;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5" /> {c.contract_number}
              <Badge variant="outline">{CONTRACT_TYPE_LABEL[c.contract_type]}</Badge>
            </div>
            <h2 className="text-xl font-semibold">{c.title || "Untitled contract"}</h2>
            <div className="mt-1 text-sm text-muted-foreground">
              {format(parseISO(c.start_date), "dd MMM yyyy")}
              {c.end_date ? ` → ${format(parseISO(c.end_date), "dd MMM yyyy")}` : ""}
              {c.payment_terms && ` · Terms: ${c.payment_terms}`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={meta.tone} variant="outline">{meta.label}</Badge>
            <Select value={c.status} onValueChange={(v) => updateContract.mutate({ status: v as ContractStatus })}>
              <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(CONTRACT_STATUS_META) as ContractStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{CONTRACT_STATUS_META[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => delContract.mutate()}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
        {c.notes && <p className="mt-3 whitespace-pre-wrap text-sm">{c.notes}</p>}
        <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
          <div><div className="text-xs text-muted-foreground">Total</div><div className="font-semibold">{formatBDT(Number(c.total_value))}</div></div>
          <div><div className="text-xs text-muted-foreground">Received</div><div className="font-semibold text-emerald-600">{formatBDT(received)}</div></div>
          <div><div className="text-xs text-muted-foreground">Outstanding</div><div className="font-semibold text-amber-600">{formatBDT(outstanding)}</div></div>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Payment milestones</h3>
        <AddMilestoneDialog contractId={contractId} onAdded={() => qc.invalidateQueries({ queryKey: ["contract-payments", contractId] })} />
      </div>

      {ms.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No milestones yet.</Card>
      ) : (
        <div className="space-y-2">
          {ms.map((m) => {
            const pm = PAYMENT_STATUS_META[m.status];
            const overdue = m.status !== "received" && m.status !== "cancelled" && new Date(m.due_date) < new Date();
            return (
              <Card key={m.id} className="p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">{m.name}</div>
                      <Badge className={pm.tone} variant="outline">{pm.label}</Badge>
                      {overdue && <Badge variant="outline" className="border-destructive text-destructive">Overdue</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Due {format(parseISO(m.due_date), "dd MMM yyyy")}
                      {m.received_at && ` · received ${format(parseISO(m.received_at), "dd MMM yyyy")}`}
                      {m.invoice_number && ` · ${m.invoice_number}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatBDT(Number(m.amount))}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Select value={m.status} onValueChange={(v) => setPayStatus.mutate({ id: m.id, status: v as PaymentStatus })}>
                      <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(PAYMENT_STATUS_META) as PaymentStatus[]).map((s) => (
                          <SelectItem key={s} value={s}>{PAYMENT_STATUS_META[s].label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {m.status !== "received" && (
                      <Button size="sm" variant="ghost" onClick={() => setPayStatus.mutate({ id: m.id, status: "received" })}>
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => delPay.mutate(m.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddMilestoneDialog({ contractId, onAdded }: { contractId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || !dueDate || !amount) return toast.error("Fill all fields");
    setBusy(true);
    try {
      const { error } = await supabase.from("contract_payments").insert({
        contract_id: contractId, name: name.trim(), due_date: dueDate, amount: Number(amount),
      });
      if (error) throw error;
      toast.success("Milestone added");
      setOpen(false); setName(""); setDueDate(""); setAmount("");
      onAdded();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Add milestone</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add payment milestone</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Advance 30%" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Due date *</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
            <div><Label>Amount (BDT) *</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
