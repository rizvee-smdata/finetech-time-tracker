import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { toast } from "sonner";
import { CONTRACT_TYPE_LABEL, type ContractType } from "@/lib/contracts/types";

export const Route = createFileRoute("/_authenticated/contracts/new")({
  component: NewContract,
});

function NewContract() {
  const { user, companyId } = useAuth();
  const navigate = useNavigate();

  const [contractNumber, setContractNumber] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ContractType>("one_time");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [totalValue, setTotalValue] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [leadId, setLeadId] = useState<string>("");

  const wonLeads = useQuery({
    queryKey: ["contracts-won-leads", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_leads")
        .select("id, customer_name, company_name, expected_value")
        .eq("company_id", companyId!)
        .eq("stage", "won")
        .order("won_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!user || !companyId) throw new Error("Auth required");
      if (!contractNumber.trim()) throw new Error("Contract # required");
      const { data, error } = await supabase
        .from("contracts").insert({
          company_id: companyId,
          user_id: user.id,
          created_by: user.id,
          contract_number: contractNumber.trim(),
          title: title || null,
          contract_type: type,
          start_date: startDate,
          end_date: endDate || null,
          total_value: Number(totalValue) || 0,
          currency: "BDT",
          payment_terms: paymentTerms || null,
          notes: notes || null,
          lead_id: leadId || null,
          status: "active",
        }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success("Contract created — add payment milestones next");
      navigate({ to: "/contracts/$contractId", params: { contractId: id } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="mx-auto max-w-2xl p-6">
      <h2 className="text-lg font-semibold">New contract</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <Label>Contract # *</Label>
          <Input value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} placeholder="LH-2026-001" />
        </div>
        <div>
          <Label>Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as ContractType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(CONTRACT_TYPE_LABEL) as ContractType[]).map((t) => (
                <SelectItem key={t} value={t}>{CONTRACT_TYPE_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Annual security platform AMC" />
        </div>
        <div className="md:col-span-2">
          <Label>Link to Won lead (optional)</Label>
          <Select value={leadId} onValueChange={setLeadId}>
            <SelectTrigger><SelectValue placeholder="Pick a closed deal" /></SelectTrigger>
            <SelectContent>
              {(wonLeads.data ?? []).map((l: any) => (
                <SelectItem key={l.id} value={l.id}>{l.customer_name}{l.company_name ? ` — ${l.company_name}` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Start date *</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <Label>End date</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div>
          <Label>Total value (BDT) *</Label>
          <Input type="number" value={totalValue} onChange={(e) => setTotalValue(e.target.value)} />
        </div>
        <div>
          <Label>Payment terms</Label>
          <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. 30/50/20" />
        </div>
        <div className="md:col-span-2">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate({ to: "/contracts" })}>Cancel</Button>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create"}
        </Button>
      </div>
    </Card>
  );
}
