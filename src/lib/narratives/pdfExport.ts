import jsPDF from "jspdf";
import type { NarrativeReportRow } from "./types";
import { fmtBDT, fmtPct } from "./utils";

const INK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const BRAND: [number, number, number] = [16, 122, 86];

function stripMd(md: string): string {
  return md
    .replace(/^#+\s*/gm, "")
    .replace(/[*_`>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function exportNarrativePdf(report: NarrativeReportRow, companyName = "") {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const marginX = 18;
  let y = 22;

  // Header bar
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, w, 14, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("times", "bold");
  doc.setFontSize(11);
  doc.text(companyName || "Executive Briefing", marginX, 9);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${report.week_start} → ${report.week_end}`, w - marginX, 9, { align: "right" });

  // Title
  doc.setTextColor(...INK);
  doc.setFont("times", "bold");
  doc.setFontSize(20);
  const titleLines = doc.splitTextToSize(report.title, w - marginX * 2);
  doc.text(titleLines, marginX, y);
  y += titleLines.length * 8 + 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`${report.role.toUpperCase()} VIEW · Generated ${new Date(report.created_at).toLocaleDateString()}`, marginX, y);
  y += 8;

  // Metrics bar
  const m = report.metrics;
  const items: Array<[string, string]> = [
    ["Revenue", fmtBDT(m.revenue_closed)],
    ["Pipeline", fmtBDT(m.pipeline_value)],
    ["Visits", `${m.visits_done}/${m.visits_target}`],
    ["Attendance", fmtPct(m.attendance_rate)],
    ["At-risk", String(m.at_risk_clients)],
    ["Expenses", fmtBDT(m.expenses_total)],
  ];
  const colW = (w - marginX * 2) / items.length;
  doc.setDrawColor(220);
  doc.setLineWidth(0.2);
  doc.line(marginX, y, w - marginX, y);
  y += 4;
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  items.forEach(([label], i) => doc.text(label.toUpperCase(), marginX + colW * i, y));
  y += 4;
  doc.setFontSize(11);
  doc.setFont("times", "bold");
  doc.setTextColor(...INK);
  items.forEach(([, val], i) => doc.text(val, marginX + colW * i, y));
  y += 4;
  doc.setDrawColor(220);
  doc.line(marginX, y, w - marginX, y);
  y += 8;

  // Body
  doc.setFont("times", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  const body = stripMd(report.body_md);
  const lines = doc.splitTextToSize(body, w - marginX * 2);
  for (const line of lines) {
    if (y > h - 22) {
      footer(doc, h, marginX, w);
      doc.addPage();
      y = 22;
    }
    doc.text(line, marginX, y);
    y += 6;
  }
  footer(doc, h, marginX, w);

  const file = `${(companyName || "narrative").replace(/\W+/g, "_")}_${report.role}_${report.week_start}.pdf`;
  doc.save(file);
}

function footer(doc: jsPDF, h: number, mx: number, w: number) {
  doc.setDrawColor(220);
  doc.setLineWidth(0.2);
  doc.line(mx, h - 14, w - mx, h - 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(`Confidential · ${new Date().toLocaleDateString()}`, mx, h - 8);
  doc.text("Executive Briefing", w - mx, h - 8, { align: "right" });
}
