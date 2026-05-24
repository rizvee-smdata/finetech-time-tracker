import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { STAGES, type CrmStage } from "@/lib/crm/types";

const sb = supabase as any;

const TEMPLATE_HEADERS = [
  "customer_name", "company_name", "contact_person", "phone", "email",
  "stage", "priority", "expected_value", "currency", "probability",
  "expected_close_date", "location", "notes",
];

const TEMPLATE_CSV =
  TEMPLATE_HEADERS.join(",") + "\n" +
  "Acme Corp,Acme Inc,Jane Doe,+1234567890,jane@acme.com,new,medium,5000,USD,20,2026-12-31,New York,Initial contact from website";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  let cur = "";
  let row: string[] = [];
  let inQuotes = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i += 2; continue; }
      if (ch === '"') { inQuotes = false; i++; continue; }
      cur += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ",") { row.push(cur); cur = ""; i++; continue; }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = []; i++;
      continue;
    }
    cur += ch; i++;
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    if (row.some((c) => c.trim() !== "")) rows.push(row);
  }
  return rows;
}

const STAGE_IDS = new Set(STAGES.map((s) => s.id));
const PRIORITIES = new Set(["low", "medium", "high"]);

type ParsedRow = {
  ok: boolean;
  error?: string;
  data: Record<string, any>;
  raw: string[];
};

function buildRows(rows: string[][]): ParsedRow[] {
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((raw) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = (raw[idx] ?? "").trim(); });
    const data: Record<string, any> = {};
    let error: string | undefined;

    if (!obj.customer_name) error = "customer_name is required";

    data.customer_name = obj.customer_name;
    data.company_name = obj.company_name || null;
    data.contact_person = obj.contact_person || null;
    data.phone = obj.phone || null;
    data.email = obj.email || null;
    data.location = obj.location || null;
    data.notes = obj.notes || null;

    const stage = (obj.stage || "new").toLowerCase();
    if (!STAGE_IDS.has(stage as CrmStage)) error = error ?? `Invalid stage: ${obj.stage}`;
    data.stage = stage;

    const priority = (obj.priority || "medium").toLowerCase();
    if (!PRIORITIES.has(priority)) error = error ?? `Invalid priority: ${obj.priority}`;
    data.priority = priority;

    if (obj.expected_value) {
      const v = Number(obj.expected_value);
      if (Number.isNaN(v)) error = error ?? `Invalid expected_value: ${obj.expected_value}`;
      else data.expected_value = v;
    }
    data.currency = (obj.currency || "USD").toUpperCase();

    if (obj.probability) {
      const p = parseInt(obj.probability);
      if (Number.isNaN(p) || p < 0 || p > 100) error = error ?? `Probability must be 0-100`;
      else data.probability = p;
    } else {
      data.probability = 10;
    }

    if (obj.expected_close_date) {
      const d = new Date(obj.expected_close_date);
      if (isNaN(d.getTime())) error = error ?? `Invalid date: ${obj.expected_close_date}`;
      else data.expected_close_date = obj.expected_close_date;
    }

    return { ok: !error, error, data, raw };
  });
}

export function ImportLeadsDialog({
  open, onOpenChange, onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
}) {
  const { companyId, user } = useAuth();
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<ParsedRow[] | null>(null);
  const [importing, setImporting] = useState(false);

  function handlePaste(text: string) {
    setCsvText(text);
    const rows = parseCsv(text);
    setPreview(buildRows(rows));
  }

  async function handleFile(file: File) {
    const text = await file.text();
    handlePaste(text);
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "leads-template.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function doImport() {
    if (!preview || !companyId || !user) return;
    const valid = preview.filter((r) => r.ok);
    if (valid.length === 0) {
      toast.error("No valid rows to import");
      return;
    }
    setImporting(true);
    const payload = valid.map((r) => ({
      ...r.data,
      company_id: companyId,
      created_by: user.id,
      source: "manual",
      lead_source: "manual",
    }));
    const { error } = await sb.from("crm_leads").insert(payload);
    setImporting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Imported ${valid.length} lead${valid.length > 1 ? "s" : ""}`);
    setPreview(null);
    setCsvText("");
    onImported();
    onOpenChange(false);
  }

  const validCount = preview?.filter((r) => r.ok).length ?? 0;
  const errorCount = preview?.filter((r) => !r.ok).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import leads from CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <FileText className="mr-2 h-4 w-4" />Download template
            </Button>
            <label>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              <Button variant="outline" size="sm" asChild>
                <span><Upload className="mr-2 h-4 w-4" />Upload CSV file</span>
              </Button>
            </label>
          </div>

          <div>
            <Label className="text-xs">Or paste CSV content</Label>
            <Textarea
              value={csvText}
              onChange={(e) => handlePaste(e.target.value)}
              rows={6}
              className="font-mono text-xs"
              placeholder={TEMPLATE_CSV}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Required header: <code>customer_name</code>. Optional: {TEMPLATE_HEADERS.slice(1).join(", ")}.
            </p>
          </div>

          {preview && preview.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20" variant="outline">
                  <CheckCircle2 className="h-3 w-3 mr-1" />{validCount} valid
                </Badge>
                {errorCount > 0 && (
                  <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                    <AlertCircle className="h-3 w-3 mr-1" />{errorCount} with errors
                  </Badge>
                )}
              </div>
              <div className="border rounded-md max-h-64 overflow-y-auto text-xs">
                <table className="w-full">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2">#</th>
                      <th className="text-left p-2">Customer</th>
                      <th className="text-left p-2">Stage</th>
                      <th className="text-left p-2">Value</th>
                      <th className="text-left p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 50).map((r, i) => (
                      <tr key={i} className={!r.ok ? "bg-destructive/5" : ""}>
                        <td className="p-2 text-muted-foreground">{i + 1}</td>
                        <td className="p-2">{r.data.customer_name || <em className="text-muted-foreground">—</em>}</td>
                        <td className="p-2">{r.data.stage}</td>
                        <td className="p-2">{r.data.expected_value ?? ""}</td>
                        <td className="p-2">
                          {r.ok ? (
                            <span className="text-emerald-600">OK</span>
                          ) : (
                            <span className="text-destructive">{r.error}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 50 && (
                  <div className="p-2 text-center text-muted-foreground">…and {preview.length - 50} more rows</div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={doImport} disabled={!preview || validCount === 0 || importing}>
            {importing ? "Importing…" : `Import ${validCount} lead${validCount !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
