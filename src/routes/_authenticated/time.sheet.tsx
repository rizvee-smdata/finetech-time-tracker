import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { startOfWeek, endOfWeek, addDays, format, isWithinInterval, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TimesheetTable } from "@/components/time/TimesheetTable";
import { ProductivityHeatmap } from "@/components/time/ProductivityHeatmap";
import { ExportButtons } from "@/components/time/ExportButtons";
import { useTimeStore } from "@/lib/time/storage";
import { useDealsStore } from "@/lib/deals/storage";
import { TIME_CATEGORIES, type TimeCategory } from "@/lib/time/types";

export const Route = createFileRoute("/_authenticated/time/sheet")({
  component: TimesheetPage,
});

function TimesheetPage() {
  const { entries } = useTimeStore();
  const { deals } = useDealsStore();
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [anchor, setAnchor] = useState(new Date());
  const [dealFilter, setDealFilter] = useState<string>("__all");
  const [catFilter, setCatFilter] = useState<string>("__all");
  const [billableOnly, setBillableOnly] = useState(false);

  const range = useMemo(() => {
    if (view === "day") return { start: startOfDay(anchor), end: endOfDay(anchor), label: format(anchor, "d MMM yyyy") };
    if (view === "month") return { start: startOfMonth(anchor), end: endOfMonth(anchor), label: format(anchor, "MMMM yyyy") };
    const s = startOfWeek(anchor, { weekStartsOn: 1 });
    return { start: s, end: endOfWeek(anchor, { weekStartsOn: 1 }), label: `${format(s, "d MMM")} – ${format(addDays(s, 6), "d MMM")}` };
  }, [view, anchor]);

  const filtered = useMemo(() => entries.filter((e) => {
    if (!isWithinInterval(new Date(e.startTime), range)) return false;
    if (dealFilter !== "__all" && e.dealId !== dealFilter) return false;
    if (catFilter !== "__all" && e.category !== catFilter) return false;
    if (billableOnly && !e.billable) return false;
    return true;
  }), [entries, range, dealFilter, catFilter, billableOnly]);

  const step = (dir: 1 | -1) => {
    const d = new Date(anchor);
    if (view === "day") d.setDate(d.getDate() + dir);
    else if (view === "month") d.setMonth(d.getMonth() + dir);
    else d.setDate(d.getDate() + 7 * dir);
    setAnchor(d);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border bg-card/40 p-0.5">
          {(["day", "week", "month"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1 text-xs rounded ${view === v ? "bg-violet-500/20 text-violet-300" : "text-muted-foreground"}`}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => step(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="text-sm font-medium min-w-[160px] text-center">{range.label}</div>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => step(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <Select value={dealFilter} onValueChange={setDealFilter}>
          <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All deals</SelectItem>
            {deals.map((d) => <SelectItem key={d.id} value={d.id}>{d.clientCompany}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All categories</SelectItem>
            {TIME_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 text-sm"><Switch checked={billableOnly} onCheckedChange={setBillableOnly} /> Billable only</div>
        <div className="ml-auto"><ExportButtons entries={filtered} label={range.label.replace(/[\s/]+/g, "-")} /></div>
      </div>

      <TimesheetTable entries={filtered} weekStart={anchor} />

      <ProductivityHeatmap entries={entries} />
    </div>
  );
}

// suppress unused import warning when TimeCategory only used as type
export type _Unused = TimeCategory;
