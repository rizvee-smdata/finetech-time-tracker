import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { GripVertical, Trash2, Plus, Clock, Timer } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchWorkCategories, fetchLogForDate, upsertDayLog, todayDhaka, formatHm,
  type WorkCategory, type TaskDraft,
} from "@/lib/officeWork/api";

const sb = supabase as any;

const QUICK_CHIPS = [
  { label: "30m", mins: 30 },
  { label: "1h", mins: 60 },
  { label: "2h", mins: 120 },
  { label: "4h", mins: 240 },
  { label: "Full day", mins: 480 },
];

type RowState = TaskDraft & {
  _rowId: string;
  _mode: "duration" | "startend";
  _customerLabel: string;
};

function newRow(defaults: Partial<RowState> = {}): RowState {
  return {
    _rowId: Math.random().toString(36).slice(2),
    _mode: "duration",
    _customerLabel: "",
    category_id: "",
    project_name: null,
    customer_id: null,
    description: "",
    start_time: null,
    end_time: null,
    duration_minutes: 60,
    status: "completed",
    blocker_note: null,
    sort_order: 0,
    ...defaults,
  };
}

export function OfficeWorkFormDialog({
  open, onOpenChange, initialDate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialDate?: string;
}) {
  const { user, companyId } = useAuth();
  const qc = useQueryClient();
  const [date, setDate] = useState<string>(initialDate ?? todayDhaka());
  const [summary, setSummary] = useState<string>("");
  const [rows, setRows] = useState<RowState[]>([newRow()]);
  const [busy, setBusy] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);

  const cats = useQuery({
    queryKey: ["work-categories"],
    queryFn: fetchWorkCategories,
  });

  useEffect(() => {
    if (!open || !user) return;
    setDate(initialDate ?? todayDhaka());
  }, [open, user, initialDate]);

  // Load existing log for the selected date
  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    (async () => {
      const log = await fetchLogForDate(user.id, date).catch(() => null);
      if (cancelled) return;
      if (log && log.tasks.length) {
        setExistingId(log.id);
        setSummary(log.day_summary ?? "");
        setRows(log.tasks.map((t) => ({
          _rowId: t.id,
          _mode: t.start_time && t.end_time ? "startend" : "duration",
          _customerLabel: "",
          id: t.id,
          category_id: t.category_id,
          project_name: t.project_name,
          customer_id: t.customer_id,
          description: t.description,
          start_time: t.start_time,
          end_time: t.end_time,
          duration_minutes: t.duration_minutes,
          status: t.status,
          blocker_note: t.blocker_note,
          sort_order: t.sort_order,
        })));
      } else {
        setExistingId(null);
        setSummary("");
        setRows([newRow({ category_id: cats.data?.[0]?.id ?? "" })]);
      }
    })();
    return () => { cancelled = true; };
  }, [date, open, user, cats.data]);

  const total = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.duration_minutes) || 0), 0),
    [rows],
  );

  function updateRow(id: string, patch: Partial<RowState>) {
    setRows((rs) => rs.map((r) => (r._rowId === id ? { ...r, ...patch } : r)));
  }
  function removeRow(id: string) {
    setRows((rs) => (rs.length <= 1 ? rs : rs.filter((r) => r._rowId !== id)));
  }
  function addRow() {
    setRows((rs) => [...rs, newRow({ category_id: cats.data?.[0]?.id ?? "" })]);
  }
  function moveRow(id: string, dir: -1 | 1) {
    setRows((rs) => {
      const idx = rs.findIndex((r) => r._rowId === id);
      if (idx < 0) return rs;
      const target = idx + dir;
      if (target < 0 || target >= rs.length) return rs;
      const copy = rs.slice();
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      return copy;
    });
  }

  async function save() {
    if (!user) return;
    // Validation
    for (const r of rows) {
      if (!r.category_id) return toast.error("Pick a category for every task");
      if (!r.description.trim()) return toast.error("Description is required for every task");
      if (r._mode === "startend") {
        if (!r.start_time || !r.end_time) return toast.error("Set start and end time");
        const [sh, sm] = r.start_time.split(":").map(Number);
        const [eh, em] = r.end_time.split(":").map(Number);
        const mins = eh * 60 + em - (sh * 60 + sm);
        if (mins <= 0) return toast.error("End time must be after start time");
        r.duration_minutes = mins;
      }
      if (!r.duration_minutes || r.duration_minutes <= 0) return toast.error("Duration must be > 0");
      if (r.status === "blocked" && !r.blocker_note?.trim()) {
        return toast.error("Add a blocker note for blocked tasks");
      }
    }

    if (total < 240) {
      if (!confirm("You've logged less than half a day — save anyway?")) return;
    } else if (total > 720) {
      if (!confirm("That's more than 12 hours — please double-check. Save anyway?")) return;
    }

    setBusy(true);
    try {
      await upsertDayLog({
        userId: user.id,
        companyId: companyId ?? null,
        workDate: date,
        daySummary: summary.trim() || null,
        tasks: rows.map((r, i) => ({
          category_id: r.category_id,
          project_name: r.project_name?.trim() || null,
          customer_id: r.customer_id,
          description: r.description.trim(),
          start_time: r._mode === "startend" ? r.start_time : null,
          end_time: r._mode === "startend" ? r.end_time : null,
          duration_minutes: r.duration_minutes,
          status: r.status,
          blocker_note: r.status === "blocked" ? (r.blocker_note?.trim() || null) : null,
          sort_order: i,
        })),
      });
      toast.success(existingId ? "Log updated" : "Office work logged");
      qc.invalidateQueries({ queryKey: ["office-work-logs"] });
      qc.invalidateQueries({ queryKey: ["office-work-my-day"] });
      qc.invalidateQueries({ queryKey: ["office-work-report"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto"
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); save(); } }}
      >
        <DialogHeader>
          <DialogTitle>Log office work</DialogTitle>
          <DialogDescription>Break your day into tasks so the team can see where time goes.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1">
              <Label>Date</Label>
              <Input
                type="date"
                value={date}
                max={todayDhaka()}
                onChange={(e) => setDate(e.target.value)}
                className="w-[180px]"
              />
            </div>
            {existingId && (
              <p className="text-xs text-muted-foreground">You already logged this day — editing existing log.</p>
            )}
          </div>

          <div className="space-y-3">
            {rows.map((r, i) => (
              <TaskRow
                key={r._rowId}
                row={r}
                categories={cats.data ?? []}
                onChange={(patch) => updateRow(r._rowId, patch)}
                onRemove={() => removeRow(r._rowId)}
                onMoveUp={i > 0 ? () => moveRow(r._rowId, -1) : undefined}
                onMoveDown={i < rows.length - 1 ? () => moveRow(r._rowId, 1) : undefined}
              />
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="mr-1 h-4 w-4" /> Add another task
          </Button>

          <div className="grid gap-2">
            <Label>Day summary (optional)</Label>
            <Textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)}
              placeholder="A quick note about the day (optional)." />
          </div>

          <div className="rounded-md bg-muted px-3 py-2 text-sm">
            <span className="font-medium">Total logged: </span>
            <span className="font-semibold">{formatHm(total)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaskRow({
  row, categories, onChange, onRemove, onMoveUp, onMoveDown,
}: {
  row: RowState;
  categories: WorkCategory[];
  onChange: (p: Partial<RowState>) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const cat = categories.find((c) => c.id === row.category_id);
  return (
    <div className="rounded-lg border p-3 space-y-3 bg-card">
      <div className="flex items-start gap-2">
        <div className="flex flex-col gap-1 pt-1">
          <button type="button" onClick={onMoveUp} disabled={!onMoveUp}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move up">
            <GripVertical className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label className="text-xs">Category</Label>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={row.category_id}
              onChange={(e) => onChange({ category_id: e.target.value })}
            >
              <option value="">Select…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {cat && (
              <Badge className="w-fit mt-1" style={{ backgroundColor: cat.color, color: "#fff" }}>
                {cat.name}
              </Badge>
            )}
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Project / customer (optional)</Label>
            <CustomerCombo
              value={row.project_name ?? ""}
              customerId={row.customer_id}
              onPick={(v) => onChange({ project_name: v.label || null, customer_id: v.customerId })}
            />
          </div>
          <div className="grid gap-1 sm:col-span-2">
            <Label className="text-xs">Description</Label>
            <Textarea
              rows={1}
              value={row.description}
              onChange={(e) => onChange({ description: e.target.value })}
              placeholder="What exactly did you work on?"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  (e.currentTarget.closest(".space-y-3")?.querySelector("input[type=number]") as HTMLInputElement | null)?.focus();
                }
              }}
            />
          </div>

          {/* Time */}
          <div className="grid gap-1 sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Time spent</Label>
              <button
                type="button"
                className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"
                onClick={() => onChange({ _mode: row._mode === "duration" ? "startend" : "duration" })}
              >
                {row._mode === "duration"
                  ? (<><Clock className="h-3 w-3" /> switch to start–end</>)
                  : (<><Timer className="h-3 w-3" /> switch to duration</>)}
              </button>
            </div>

            {row._mode === "duration" ? (
              <div className="flex flex-wrap items-center gap-2">
                {QUICK_CHIPS.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => onChange({ duration_minutes: c.mins })}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      row.duration_minutes === c.mins
                        ? "bg-primary text-primary-foreground border-primary"
                        : "hover:bg-accent"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    step="0.25"
                    min={0}
                    className="w-24"
                    value={(row.duration_minutes / 60).toString()}
                    onChange={(e) => onChange({ duration_minutes: Math.round(Number(e.target.value) * 60) })}
                  />
                  <span className="text-xs text-muted-foreground">hours</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="time"
                  value={row.start_time ?? ""}
                  onChange={(e) => onChange({ start_time: e.target.value || null })}
                  className="w-32"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="time"
                  value={row.end_time ?? ""}
                  onChange={(e) => onChange({ end_time: e.target.value || null })}
                  className="w-32"
                />
              </div>
            )}
          </div>

          {/* Status */}
          <div className="grid gap-1 sm:col-span-2">
            <Label className="text-xs">Status</Label>
            <div className="inline-flex rounded-md border p-0.5 w-fit">
              {(["completed", "in_progress", "blocked"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChange({ status: s })}
                  className={`px-3 py-1 text-xs rounded ${
                    row.status === s
                      ? s === "blocked"
                        ? "bg-red-500 text-white"
                        : "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {s === "in_progress" ? "In progress" : s[0].toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            {row.status === "blocked" && (
              <Textarea
                rows={2}
                className="mt-1"
                placeholder="What is blocking you?"
                value={row.blocker_note ?? ""}
                onChange={(e) => onChange({ blocker_note: e.target.value })}
              />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Button size="icon" variant="ghost" onClick={onRemove} title="Remove">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
          {onMoveDown && (
            <button type="button" onClick={onMoveDown}
              className="text-muted-foreground hover:text-foreground text-xs">↓</button>
          )}
        </div>
      </div>
    </div>
  );
}

function CustomerCombo({
  value, customerId, onPick,
}: {
  value: string;
  customerId: string | null;
  onPick: (v: { label: string; customerId: string | null }) => void;
}) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<Array<{ id: string; customer_name: string }>>([]);

  useEffect(() => { setText(value); }, [value]);

  useEffect(() => {
    if (!focused || !text || text.length < 2) { setResults([]); return; }
    const h = setTimeout(async () => {
      const { data } = await sb
        .from("customers")
        .select("id, customer_name")
        .ilike("customer_name", `%${text}%`)
        .limit(6);
      setResults(data ?? []);
    }, 200);
    return () => clearTimeout(h);
  }, [text, focused]);

  return (
    <div className="relative">
      <Input
        value={text}
        onChange={(e) => { setText(e.target.value); onPick({ label: e.target.value, customerId: null }); }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="e.g. BPDB Network Project"
      />
      {focused && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
              onMouseDown={(e) => { e.preventDefault(); setText(r.customer_name); onPick({ label: r.customer_name, customerId: r.id }); setFocused(false); }}
            >
              {r.customer_name}
            </button>
          ))}
        </div>
      )}
      {customerId && (
        <div className="mt-1 text-xs text-muted-foreground">Linked to customer</div>
      )}
    </div>
  );
}
