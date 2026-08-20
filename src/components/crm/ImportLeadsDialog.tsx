import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, AlertCircle, CheckCircle2, Copy } from "lucide-react";
import { toast } from "sonner";
import { STAGES, type CrmStage } from "@/lib/crm/types";

const sb = supabase as any;

type FieldDef = { key: string; label: string; required?: boolean };

const FIELDS: FieldDef[] = [
  { key: "customer_name", label: "Customer name", required: true },
  { key: "company_name", label: "Company name" },
  { key: "contact_person", label: "Contact person" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "stage", label: "Stage" },
  { key: "priority", label: "Priority" },
  { key: "expected_value", label: "Expected value" },
  { key: "currency", label: "Currency" },
  { key: "probability", label: "Probability (0-100)" },
  { key: "expected_close_date", label: "Expected close date" },
  { key: "location", label: "Location" },
  { key: "notes", label: "Notes" },
];

const TEMPLATE_HEADERS = FIELDS.map((f) => f.key);

const TEMPLATE_CSV =
  TEMPLATE_HEADERS.join(",") + "\n" +
  "Acme Corp,Acme Inc,Jane Doe,+1234567890,jane@acme.com,new,medium,5000,USD,20,2026-12-31,New York,Initial contact from website";

const IGNORE = "__ignore__";

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
  duplicate?: string;
  data: Record<string, any>;
};

function normStr(s?: string | null) { return (s ?? "").trim().toLowerCase(); }
function normPhone(s?: string | null) { return (s ?? "").replace(/\D+/g, ""); }

/** Guess a field for a CSV header. */
function autoMap(header: string): string {
  const h = header.trim().toLowerCase().replace(/[\s\-]+/g, "_");
  const direct = FIELDS.find((f) => f.key === h);
  if (direct) return direct.key;
  const alias: Record<string, string> = {
    name: "customer_name", customer: "customer_name", client: "customer_name", account: "customer_name",
    account_name: "customer_name", client_name: "customer_name",
    company: "company_name", organisation: "company_name", organization: "company_name",
    contact: "contact_person", contact_name: "contact_person", person: "contact_person",
    mobile: "phone", telephone: "phone", phone_number: "phone", tel: "phone",
    email_address: "email", mail: "email", e_mail: "email",
    status: "stage", pipeline_stage: "stage",
    value: "expected_value", amount: "expected_value", deal_value: "expected_value", revenue: "expected_value",
    close_date: "expected_close_date", closing_date: "expected_close_date", expected_close: "expected_close_date",
    city: "location", country: "location", address: "location",
    comment: "notes", comments: "notes", remarks: "notes", description: "notes",
    prob: "probability", win_probability: "probability",
  };
  return alias[h] ?? IGNORE;
}

type ExistingLead = { customer_name: string | null; email: string | null; phone: string | null };

function buildRows(
  rows: string[][],
  mapping: string[],
  existing: ExistingLead[],
  skipDupes: boolean,
): ParsedRow[] {
  if (rows.length === 0) return [];

  const byEmail = new Set(existing.map((e) => normStr(e.email)).filter(Boolean));
  const byPhone = new Set(existing.map((e) => normPhone(e.phone)).filter((p) => p.length >= 6));
  const byName = new Set(existing.map((e) => normStr(e.customer_name)).filter(Boolean));
  const seenEmail = new Set<string>();
  const seenName = new Set<string>();

  return rows.slice(1).map((raw) => {
    const obj: Record<string, string> = {};
    mapping.forEach((field, idx) => {
      if (field === IGNORE) return;
      obj[field] = (raw[idx] ?? "").trim();
    });

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
      const v = Number(String(obj.expected_value).replace(/[,\s]/g, ""));
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

    // Duplicate detection (against existing leads and earlier rows in this file)
    let duplicate: string | undefined;
    const e = normStr(data.email);
    const p = normPhone(data.phone);
    const n = normStr(data.customer_name);
    if (e && (byEmail.has(e) || seenEmail.has(e))) duplicate = "Same email already exists";
    else if (p.length >= 6 && byPhone.has(p)) duplicate = "Same phone already exists";
    else if (n && (byName.has(n) || seenName.has(n))) duplicate = "Same customer name already exists";
    if (e) seenEmail.add(e);
    if (n) seenName.add(n);

    const ok = !error && !(skipDupes && duplicate);
    return { ok, error, duplicate, data };
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
  const [rawRows, setRawRows] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<string[]>([]);
  const [skipDupes, setSkipDupes] = useState(true);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [existing, setExisting] = useState<ExistingLead[]>([]);
  const [lastBatch, setLastBatch] = useState<{ id: string; count: number } | null>(null);

  useEffect(() => {
    if (!open || !companyId) return;
    let cancelled = false;
    (async () => {
      const { data } = await sb
        .from("crm_leads")
        .select("customer_name, email, phone")
        .eq("company_id", companyId)
        .limit(5000);
      if (!cancelled) setExisting((data ?? []) as ExistingLead[]);
    })();
    return () => { cancelled = true; };
  }, [open, companyId]);

  const headers = rawRows?.[0] ?? [];

  const preview = useMemo(
    () => (rawRows ? buildRows(rawRows, mapping, existing, skipDupes) : null),
    [rawRows, mapping, existing, skipDupes],
  );

  function handlePaste(text: string) {
    setCsvText(text);
    const rows = parseCsv(text);
    setRawRows(rows.length ? rows : null);
    setMapping(rows.length ? rows[0].map(autoMap) : []);
  }

  async function handleFile(file: File) {
    handlePaste(await file.text());
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "leads-template.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function undoImport(batchId: string) {
    const { error } = await sb.from("crm_leads").delete().eq("import_batch_id", batchId);
    if (error) { toast.error("Undo failed: " + error.message); return; }
    setLastBatch(null);
    toast.success("Import rolled back");
    onImported();
  }

  async function doImport() {
    if (!preview || !companyId || !user) return;
    const valid = preview.filter((r) => r.ok);
    if (valid.length === 0) {
      toast.error("No valid rows to import");
      return;
    }
    setImporting(true);
    setProgress({ done: 0, total: valid.length });
    const batchId = crypto.randomUUID();
    const payload = valid.map((r) => ({
      ...r.data,
      company_id: companyId,
      created_by: user.id,
      source: "manual",
      lead_source: "manual",
      import_batch_id: batchId,
    }));

    // Insert in small chunks. A single large insert can stall behind PostgREST /
    // RLS evaluation and leave the dialog stuck on "Importing…" forever.
    const CHUNK = 50;
    let inserted = 0;
    let failure: string | null = null;
    try {
      for (let i = 0; i < payload.length; i += CHUNK) {
        const chunk = payload.slice(i, i + CHUNK);
        const { error } = await Promise.race([
          sb.from("crm_leads").insert(chunk, { returning: "minimal" }),
          new Promise<{ error: { message: string } }>((resolve) =>
            setTimeout(
              () => resolve({ error: { message: "Server did not respond in time. Please retry." } }),
              45_000,
            ),
          ),
        ]);
        if (error) { failure = error.message; break; }
        inserted += chunk.length;
        setProgress({ done: inserted, total: payload.length });
      }
    } catch (e: any) {
      failure = e?.message ?? "Unexpected error during import";
    } finally {
      setImporting(false);
      setProgress(null);
    }

    if (inserted > 0) setLastBatch({ id: batchId, count: inserted });

    if (failure) {
      toast.error(
        inserted > 0
          ? `Imported ${inserted} of ${payload.length}. Stopped: ${failure}`
          : `Import failed: ${failure}`,
      );
      onImported();
      return;
    }

    toast.success(`Imported ${inserted} lead${inserted > 1 ? "s" : ""}`, {
      duration: 10000,
      action: { label: "Undo", onClick: () => undoImport(batchId) },
    });
    setRawRows(null);
    setCsvText("");
    onImported();
  }

  const validCount = preview?.filter((r) => r.ok).length ?? 0;
  const errorCount = preview?.filter((r) => r.error).length ?? 0;
  const dupeCount = preview?.filter((r) => !r.error && r.duplicate).length ?? 0;
  const missingRequired = FIELDS.filter((f) => f.required && !mapping.includes(f.key));

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
            {lastBatch && (
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive"
                onClick={() => undoImport(lastBatch.id)}>
                Undo last import ({lastBatch.count})
              </Button>
            )}
          </div>

          <div>
            <Label className="text-xs">Or paste CSV content</Label>
            <Textarea
              value={csvText}
              onChange={(e) => handlePaste(e.target.value)}
              rows={5}
              className="font-mono text-xs"
              placeholder={TEMPLATE_CSV}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Any column names work — map them to CRM fields below. Only <code>customer_name</code> is required.
            </p>
          </div>

          {headers.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs">Map your columns</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {headers.map((h, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-1/2 truncate text-xs font-mono text-muted-foreground" title={h}>
                      {h || `Column ${idx + 1}`}
                    </span>
                    <Select
                      value={mapping[idx] ?? IGNORE}
                      onValueChange={(v) => setMapping((m) => m.map((x, i) => (i === idx ? v : x)))}
                    >
                      <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={IGNORE}>— Ignore —</SelectItem>
                        {FIELDS.map((f) => (
                          <SelectItem key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              {missingRequired.length > 0 && (
                <p className="text-xs text-destructive">
                  Map a column to: {missingRequired.map((f) => f.label).join(", ")}
                </p>
              )}
              <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={skipDupes} onCheckedChange={(v) => setSkipDupes(!!v)} />
                Skip rows that match an existing lead (email, phone or customer name)
              </label>
            </div>
          )}

          {preview && preview.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20" variant="outline">
                  <CheckCircle2 className="h-3 w-3 mr-1" />{validCount} will import
                </Badge>
                {dupeCount > 0 && (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/20">
                    <Copy className="h-3 w-3 mr-1" />{dupeCount} duplicate{dupeCount === 1 ? "" : "s"}
                  </Badge>
                )}
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
                      <tr key={i} className={r.error ? "bg-destructive/5" : r.duplicate ? "bg-amber-500/5" : ""}>
                        <td className="p-2 text-muted-foreground">{i + 1}</td>
                        <td className="p-2">{r.data.customer_name || <em className="text-muted-foreground">—</em>}</td>
                        <td className="p-2">{r.data.stage}</td>
                        <td className="p-2">{r.data.expected_value ?? ""}</td>
                        <td className="p-2">
                          {r.error ? (
                            <span className="text-destructive">{r.error}</span>
                          ) : r.duplicate ? (
                            <span className="text-amber-700">{r.duplicate}{skipDupes ? " — skipped" : " — importing anyway"}</span>
                          ) : (
                            <span className="text-emerald-600">OK</span>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={doImport} disabled={!preview || validCount === 0 || importing || missingRequired.length > 0}>
            {importing ? "Importing…" : `Import ${validCount} lead${validCount !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
