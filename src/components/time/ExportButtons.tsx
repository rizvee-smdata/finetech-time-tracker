import jsPDF from "jspdf";
import { format } from "date-fns";
import { toast } from "sonner";
import { Download, FileText, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TimeEntry } from "@/lib/time/types";

function fmtH(min: number) { return (min / 60).toFixed(2); }

export function ExportButtons({ entries, label }: { entries: TimeEntry[]; label: string }) {
  function exportCSV() {
    const header = ["Date", "Start", "End", "Description", "Category", "Client", "Billable", "Duration (min)", "Tags"];
    const rows = entries.map((e) => [
      format(new Date(e.startTime), "yyyy-MM-dd"),
      format(new Date(e.startTime), "HH:mm"),
      e.endTime ? format(new Date(e.endTime), "HH:mm") : "",
      JSON.stringify(e.description),
      e.category,
      e.clientCompany ?? "",
      e.billable ? "yes" : "no",
      String(e.duration),
      e.tags.join("|"),
    ]);
    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `timesheet-${label}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  }

  function exportPDF() {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`DeskIQ Timesheet — ${label}`, 14, 18);
    doc.setFontSize(10);
    doc.text(`Generated ${format(new Date(), "PPp")}`, 14, 25);
    let y = 35;
    doc.setFontSize(9);
    doc.text("Date       Start  End    Cat                  Client            Bill  Mins  Description", 14, y);
    y += 5;
    for (const e of entries) {
      if (y > 280) { doc.addPage(); y = 20; }
      const line = [
        format(new Date(e.startTime), "yyyy-MM-dd"),
        format(new Date(e.startTime), "HH:mm"),
        e.endTime ? format(new Date(e.endTime), "HH:mm") : "—   ",
        e.category.padEnd(20).slice(0, 20),
        (e.clientCompany ?? "—").padEnd(16).slice(0, 16),
        e.billable ? "Y " : "N ",
        String(e.duration).padStart(4),
        " " + e.description.slice(0, 60),
      ].join(" ");
      doc.text(line, 14, y);
      y += 5;
    }
    const total = entries.reduce((s, e) => s + e.duration, 0);
    const bill = entries.filter((e) => e.billable).reduce((s, e) => s + e.duration, 0);
    y += 5;
    if (y > 280) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.text(`Total: ${fmtH(total)} h   Billable: ${fmtH(bill)} h   Entries: ${entries.length}`, 14, y);
    doc.save(`timesheet-${label}.pdf`);
    toast.success("PDF exported");
  }

  async function copySummary() {
    const total = entries.reduce((s, e) => s + e.duration, 0);
    const bill = entries.filter((e) => e.billable).reduce((s, e) => s + e.duration, 0);
    const byCat = new Map<string, number>();
    for (const e of entries) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.duration);
    const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1])
      .map(([c, m]) => `- ${c}: ${fmtH(m)} h`).join("\n");
    const text = `Timesheet summary — ${label}\nTotal: ${fmtH(total)} h\nBillable: ${fmtH(bill)} h\nEntries: ${entries.length}\n\nBy category:\n${cats}`;
    await navigator.clipboard.writeText(text);
    toast.success("Summary copied");
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={exportCSV}><Download className="mr-1 h-4 w-4" /> CSV</Button>
      <Button size="sm" variant="outline" onClick={exportPDF}><FileText className="mr-1 h-4 w-4" /> PDF</Button>
      <Button size="sm" variant="outline" onClick={copySummary}><Copy className="mr-1 h-4 w-4" /> Copy summary</Button>
    </div>
  );
}
