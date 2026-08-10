import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/crm/types";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Copy, GitMerge, AlertCircle, Mail, Phone, User, Building2 } from "lucide-react";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/crm/duplicates")({
  component: DuplicatesPage,
});

function DuplicatesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Duplicates</h1>
        <p className="text-sm text-muted-foreground">
          Find leads or customer accounts that look like the same person or company, then merge them into one record.
        </p>
      </div>
      <Tabs defaultValue="leads">
        <TabsList>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
        </TabsList>
        <TabsContent value="leads" className="mt-4"><LeadDuplicates /></TabsContent>
        <TabsContent value="customers" className="mt-4"><CustomerDuplicates /></TabsContent>
      </Tabs>
    </div>
  );
}


type Lead = {
  id: string;
  customer_name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  contact_person: string | null;
  stage: string;
  expected_value: number | null;
  currency: string;
  created_at: string;
  last_activity_at: string;
  assigned_to: string | null;
  account_id: string | null;
};

type Strategy = "email" | "phone" | "name";

function norm(s: string | null | undefined, kind: Strategy): string | null {
  if (!s) return null;
  const v = String(s).trim().toLowerCase();
  if (!v) return null;
  if (kind === "phone") return v.replace(/[^0-9]/g, "").replace(/^0+/, "");
  if (kind === "email") return v;
  // name + company
  return v.replace(/\s+/g, " ");
}

function LeadDuplicates() {
  const { companyId, isStaff, isAdmin } = useAuth();
  const qc = useQueryClient();
  const canMerge = isStaff || isAdmin;
  const [strategy, setStrategy] = useState<Strategy>("email");

  const leads = useQuery({
    queryKey: ["crm-leads-all", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<Lead[]> => {
      const { data, error } = await sb
        .from("crm_leads")
        .select("id, customer_name, company_name, email, phone, contact_person, stage, expected_value, currency, created_at, last_activity_at, assigned_to, account_id")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const groups = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const l of leads.data ?? []) {
      let key: string | null = null;
      if (strategy === "email") key = norm(l.email, "email");
      else if (strategy === "phone") key = norm(l.phone, "phone");
      else {
        const n = norm(l.customer_name, "name");
        const c = norm(l.company_name, "name") ?? "";
        if (n) key = `${n}|${c}`;
      }
      if (!key || key.length < 3) continue;
      const arr = map.get(key) ?? [];
      arr.push(l);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .filter(([, arr]) => arr.length > 1)
      .sort((a, b) => b[1].length - a[1].length);
  }, [leads.data, strategy]);

  const merge = useMutation({
    mutationFn: async (p: { primaryId: string; mergeIds: string[] }) => {
      // Re-point activities, attachments, quotes, call_logs, lead_products from duplicates to primary
      const tables = [
        "crm_lead_activities",
        "crm_lead_attachments",
        "crm_quotes",
        "crm_call_logs",
        "crm_lead_products",
        "crm_sequence_enrollments",
        "crm_lead_stage_history",
      ];
      for (const t of tables) {
        const { error } = await sb.from(t).update({ lead_id: p.primaryId }).in("lead_id", p.mergeIds);
        if (error) throw new Error(`${t}: ${error.message}`);
      }
      const { error: delErr } = await sb.from("crm_leads").delete().in("id", p.mergeIds);
      if (delErr) throw delErr;
    },
    onSuccess: () => {
      toast.success("Merged duplicates");
      qc.invalidateQueries({ queryKey: ["crm-leads-all"] });
    },
    onError: (e: any) => toast.error("Merge failed: " + e.message),
  });

  const totalDupes = groups.reduce((acc, [, arr]) => acc + arr.length - 1, 0);

  return (
    <div className="space-y-4">



      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Match by</span>
          <Select value={strategy} onValueChange={(v) => setStrategy(v as Strategy)}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Same email</SelectItem>
              <SelectItem value="phone">Same phone (digits only)</SelectItem>
              <SelectItem value="name">Same customer + company name</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs text-muted-foreground">
            {groups.length} duplicate group{groups.length === 1 ? "" : "s"} ·{" "}
            <span className={totalDupes > 0 ? "font-semibold text-amber-700" : ""}>{totalDupes} extra record{totalDupes === 1 ? "" : "s"}</span>
          </div>
        </div>
      </Card>

      {leads.isLoading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Scanning…</Card>
      ) : groups.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Copy className="mx-auto mb-2 size-8 opacity-50" />
          No duplicates found by {strategy}. 🎉
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map(([key, items]) => (
            <DupeGroup
              key={key}
              matchValue={key.replace("|", " · ")}
              items={items}
              strategy={strategy}
              canMerge={canMerge}
              onMerge={(primaryId, mergeIds) => merge.mutate({ primaryId, mergeIds })}
              pending={merge.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DupeGroup({
  matchValue,
  items,
  strategy,
  canMerge,
  onMerge,
  pending,
}: {
  matchValue: string;
  items: Lead[];
  strategy: Strategy;
  canMerge: boolean;
  onMerge: (primaryId: string, mergeIds: string[]) => void;
  pending: boolean;
}) {
  // Default primary: most recent activity
  const sorted = useMemo(
    () => [...items].sort((a, b) => +parseISO(b.last_activity_at) - +parseISO(a.last_activity_at)),
    [items],
  );
  const [primaryId, setPrimaryId] = useState(sorted[0].id);

  const Icon = strategy === "email" ? Mail : strategy === "phone" ? Phone : User;

  function handleMerge() {
    const merge = items.filter((i) => i.id !== primaryId).map((i) => i.id);
    if (merge.length === 0) return;
    if (!window.confirm(
      `Merge ${merge.length} lead${merge.length === 1 ? "" : "s"} into the primary?\n\n` +
      "All activities, quotes, calls, and attachments will move to the primary lead. " +
      "The duplicate lead record(s) will be deleted. This cannot be undone."
    )) return;
    onMerge(primaryId, merge);
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <AlertCircle className="size-4 text-amber-600" />
        <span className="text-sm font-semibold">{items.length} matches</span>
        <Badge variant="outline" className="font-mono text-xs">
          <Icon className="mr-1 size-3" />
          {matchValue}
        </Badge>
        {canMerge && (
          <Button size="sm" variant="default" className="ml-auto" onClick={handleMerge} disabled={pending}>
            <GitMerge className="size-4" /> Merge {items.length - 1} into primary
          </Button>
        )}
      </div>
      <div className="divide-y rounded-md border">
        {sorted.map((l) => (
          <label
            key={l.id}
            className={"flex cursor-pointer items-center gap-3 p-3 transition-colors hover:bg-muted/30 " + (l.id === primaryId ? "bg-emerald-500/5" : "")}
          >
            <input
              type="radio"
              name={`primary-${matchValue}`}
              checked={l.id === primaryId}
              onChange={() => setPrimaryId(l.id)}
              className="size-4 accent-emerald-600"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link to="/crm/$leadId" params={{ leadId: l.id }} className="font-medium hover:underline" target="_blank">
                  {l.customer_name}
                </Link>
                {l.company_name && <span className="text-sm text-muted-foreground">· {l.company_name}</span>}
                <Badge variant="outline" className="capitalize">{l.stage}</Badge>
                {l.id === primaryId && <Badge className="bg-emerald-500/20 text-emerald-700">Primary (kept)</Badge>}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {l.email && <span>{l.email}</span>}
                {l.phone && <span>{l.phone}</span>}
                <span>Created {format(parseISO(l.created_at), "MMM d, yyyy")}</span>
                <span>Last activity {format(parseISO(l.last_activity_at), "MMM d, yyyy")}</span>
              </div>
            </div>
            <div className="text-right text-sm font-semibold">
              {formatMoney(Number(l.expected_value) || 0, l.currency)}
            </div>
          </label>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- customers

type Customer = {
  id: string;
  customer_name: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  created_at: string;
};

const CUSTOMER_FK: { table: string; column: string }[] = [
  { table: "crm_leads", column: "partner_id" },
  { table: "customer_visits", column: "account_id" },
  { table: "visit_alert_log", column: "account_id" },
  { table: "visit_checkins", column: "account_id" },
  { table: "visit_snoozes", column: "customer_id" },
  { table: "visit_gap_scores", column: "customer_id" },
  { table: "office_work_tasks", column: "customer_id" },
];

function CustomerDuplicates() {
  const { companyId, isStaff, isAdmin } = useAuth();
  const qc = useQueryClient();
  const canMerge = isStaff || isAdmin;
  const [strategy, setStrategy] = useState<Strategy>("name");

  const customers = useQuery({
    queryKey: ["customers-dupe-scan", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<Customer[]> => {
      const { data, error } = await sb
        .from("customers")
        .select("id, customer_name, contact_person, email, phone, location, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as Customer[];
    },
  });

  const groups = useMemo(() => {
    const map = new Map<string, Customer[]>();
    for (const c of customers.data ?? []) {
      let key: string | null = null;
      if (strategy === "email") key = norm(c.email, "email");
      else if (strategy === "phone") key = norm(c.phone, "phone");
      else key = norm(c.customer_name, "name");
      if (!key || key.length < 3) continue;
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .filter(([, arr]) => arr.length > 1)
      .sort((a, b) => b[1].length - a[1].length);
  }, [customers.data, strategy]);

  const merge = useMutation({
    mutationFn: async (p: { primaryId: string; mergeIds: string[] }) => {
      for (const fk of CUSTOMER_FK) {
        const { error } = await sb.from(fk.table).update({ [fk.column]: p.primaryId }).in(fk.column, p.mergeIds);
        if (error) throw new Error(`${fk.table}: ${error.message}`);
      }
      const { error: delErr } = await sb.from("customers").delete().in("id", p.mergeIds);
      if (delErr) throw delErr;
    },
    onSuccess: () => {
      toast.success("Merged customers");
      qc.invalidateQueries({ queryKey: ["customers-dupe-scan"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: any) => toast.error("Merge failed: " + e.message),
  });

  const totalDupes = groups.reduce((acc, [, arr]) => acc + arr.length - 1, 0);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Match by</span>
          <Select value={strategy} onValueChange={(v) => setStrategy(v as Strategy)}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Same customer name</SelectItem>
              <SelectItem value="email">Same email</SelectItem>
              <SelectItem value="phone">Same phone (digits only)</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs text-muted-foreground">
            {groups.length} duplicate group{groups.length === 1 ? "" : "s"} ·{" "}
            <span className={totalDupes > 0 ? "font-semibold text-amber-700" : ""}>
              {totalDupes} extra record{totalDupes === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </Card>

      {customers.isLoading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Scanning…</Card>
      ) : groups.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Copy className="mx-auto mb-2 size-8 opacity-50" />
          No duplicate customers found by {strategy}. 🎉
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map(([key, items]) => (
            <CustomerDupeGroup
              key={key}
              matchValue={key}
              items={items}
              strategy={strategy}
              canMerge={canMerge}
              onMerge={(primaryId, mergeIds) => merge.mutate({ primaryId, mergeIds })}
              pending={merge.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CustomerDupeGroup({
  matchValue, items, strategy, canMerge, onMerge, pending,
}: {
  matchValue: string;
  items: Customer[];
  strategy: Strategy;
  canMerge: boolean;
  onMerge: (primaryId: string, mergeIds: string[]) => void;
  pending: boolean;
}) {
  const sorted = useMemo(
    () => [...items].sort((a, b) => +parseISO(a.created_at) - +parseISO(b.created_at)),
    [items],
  );
  const [primaryId, setPrimaryId] = useState(sorted[0].id);
  const Icon = strategy === "email" ? Mail : strategy === "phone" ? Phone : Building2;

  function handleMerge() {
    const mergeIds = items.filter((i) => i.id !== primaryId).map((i) => i.id);
    if (mergeIds.length === 0) return;
    if (!window.confirm(
      `Merge ${mergeIds.length} customer record${mergeIds.length === 1 ? "" : "s"} into the primary?\n\n` +
      "Visits, check-ins, office tasks and linked deals will move to the primary customer. " +
      "The duplicate customer record(s) will be deleted. This cannot be undone."
    )) return;
    onMerge(primaryId, mergeIds);
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <AlertCircle className="size-4 text-amber-600" />
        <span className="text-sm font-semibold">{items.length} matches</span>
        <Badge variant="outline" className="font-mono text-xs">
          <Icon className="mr-1 size-3" />
          {matchValue}
        </Badge>
        {canMerge && (
          <Button size="sm" className="ml-auto" onClick={handleMerge} disabled={pending}>
            <GitMerge className="size-4" /> Merge {items.length - 1} into primary
          </Button>
        )}
      </div>
      <div className="divide-y rounded-md border">
        {sorted.map((c) => (
          <label
            key={c.id}
            className={"flex cursor-pointer items-center gap-3 p-3 transition-colors hover:bg-muted/30 " + (c.id === primaryId ? "bg-emerald-500/5" : "")}
          >
            <input
              type="radio"
              name={`primary-cust-${matchValue}`}
              checked={c.id === primaryId}
              onChange={() => setPrimaryId(c.id)}
              className="size-4 accent-emerald-600"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{c.customer_name}</span>
                {c.contact_person && <span className="text-sm text-muted-foreground">· {c.contact_person}</span>}
                {c.id === primaryId && <Badge className="bg-emerald-500/20 text-emerald-700">Primary (kept)</Badge>}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {c.email && <span>{c.email}</span>}
                {c.phone && <span>{c.phone}</span>}
                {c.location && <span>{c.location}</span>}
                <span>Created {format(parseISO(c.created_at), "MMM d, yyyy")}</span>
              </div>
            </div>
          </label>
        ))}
      </div>
    </Card>
  );
}
