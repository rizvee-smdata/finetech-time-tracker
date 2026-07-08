import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download } from "lucide-react";
import { fetchCustomFieldDefs } from "@/lib/crm/customFields";
import { format } from "date-fns";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/reports/leads")({
  component: LeadsReportPage,
});

function LeadsReportPage() {
  const { companyId } = useAuth();
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState(format(first, "yyyy-MM-dd"));
  const [to, setTo] = useState(format(today, "yyyy-MM-dd"));

  const defsQ = useQuery({
    queryKey: ["crm-custom-fields-active", companyId],
    enabled: !!companyId,
    queryFn: () => fetchCustomFieldDefs(companyId!, { activeOnly: true }),
  });

  const leadsQ = useQuery({
    queryKey: ["report-leads", companyId, from, to],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("crm_leads")
        .select("*")
        .eq("company_id", companyId)
        .gte("created_at", from)
        .lte("created_at", to + "T23:59:59")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const assigneeIds = useMemo(
    () => Array.from(new Set((leadsQ.data ?? []).map((l) => l.assigned_to).filter(Boolean))),
    [leadsQ.data],
  );
  const profilesQ = useQuery({
    queryKey: ["profiles-for-leads-report", assigneeIds],
    enabled: assigneeIds.length > 0,
    queryFn: async () => {
      const { data } = await sb.from("profiles").select("id, full_name, email").in("id", assigneeIds);
      return new Map<string, { full_name: string | null; email: string | null }>(
        (data ?? []).map((p: any) => [p.id, p]),
      );
    },
  });

  const rows = leadsQ.data ?? [];
  const defs = defsQ.data ?? [];
  const profiles = profilesQ.data;

  const columns = useMemo(() => {
    const base = [
      { key: "no", label: "No" },
      { key: "created_at", label: "Date of Commencement" },
      { key: "company_name", label: "Company Name" },
      { key: "account_manager", label: "Account Manager Name" },
      { key: "product_name", label: "Product" },
      { key: "expected_value", label: "Deal Value ($)" },
      { key: "expected_close_date", label: "Expected Closure by" },
      { key: "stage", label: "WON / Lost" },
      { key: "notes", label: "Remarks & update" },
      { key: "contact_person", label: "Contact Name" },
      { key: "phone", label: "Contact Number" },
      { key: "email", label: "Contact Email" },
    ];
    const custom = defs.map((d) => ({ key: `cf:${d.field_key}`, label: d.label }));
    return [...base, ...custom];
  }, [defs]);

  function cellValue(row: any, key: string, idx: number): string {
    if (key === "no") return String(idx + 1);
    if (key === "created_at") return row.created_at ? format(new Date(row.created_at), "yyyy-MM-dd") : "";
    if (key === "expected_close_date") return row.expected_close_date ?? "";
    if (key === "account_manager") {
      const p = row.assigned_to ? profiles?.get(row.assigned_to) : null;
      return p?.full_name || p?.email || "";
    }
    if (key === "stage") {
      if (row.stage === "won") return "WON";
      if (row.stage === "lost") return "LOST";
      return row.stage ?? "";
    }
    if (key.startsWith("cf:")) {
      const k = key.slice(3);
      const v = row.custom_fields?.[k];
      return v == null ? "" : String(v);
    }
    const v = row[key];
    return v == null ? "" : String(v);
  }

  function exportCsv() {
    const header = columns.map((c) => csvEscape(c.label)).join(",");
    const body = rows
      .map((r, i) => columns.map((c) => csvEscape(cellValue(r, c.key, i))).join(","))
      .join("\n");
    const csv = header + "\n" + body;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-report-${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!companyId) return <p className="text-sm text-muted-foreground">Select a company first.</p>;

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label className="text-xs">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[160px]" />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[160px]" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline">{rows.length} leads</Badge>
          <Button onClick={exportCsv} disabled={!rows.length}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </Card>

      <Card className="p-0 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="px-3 py-2 text-left font-medium whitespace-nowrap border-b">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-b hover:bg-muted/20">
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-2 align-top whitespace-nowrap">
                    {cellValue(r, c.key, i)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No leads in this date range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function csvEscape(v: string) {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
