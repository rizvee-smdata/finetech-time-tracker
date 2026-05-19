import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type ExportRow = (string | number)[];

export function exportToExcel(filename: string, sheetName: string, header: string[], rows: ExportRow[]) {
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || "Sheet1");
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

export function exportToPDF(filename: string, title: string, header: string[], rows: ExportRow[]) {
  const doc = new jsPDF({ orientation: header.length > 4 ? "landscape" : "portrait" });
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22);
  autoTable(doc, {
    head: [header],
    body: rows.map((r) => r.map((c) => String(c ?? ""))),
    startY: 28,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235] },
  });
  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

export function exportTextToPDF(filename: string, title: string, text: string) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22);
  doc.setTextColor(0);
  doc.setFontSize(11);
  const lines = doc.splitTextToSize(text, 180);
  doc.text(lines, 14, 32);
  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

export function exportTranscriptToExcel(
  filename: string,
  messages: { role: string; content: string }[],
) {
  const header = ["#", "Role", "Message"];
  const rows: ExportRow[] = messages.map((m, i) => [i + 1, m.role, m.content]);
  exportToExcel(filename, "Chat", header, rows);
}

export function exportTranscriptToPDF(
  filename: string,
  title: string,
  messages: { role: string; content: string }[],
) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22);
  autoTable(doc, {
    head: [["#", "Role", "Message"]],
    body: messages.map((m, i) => [String(i + 1), m.role, m.content]),
    startY: 28,
    styles: { fontSize: 9, cellPadding: 2, overflow: "linebreak" },
    columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 22 }, 2: { cellWidth: "auto" } },
    headStyles: { fillColor: [37, 99, 235] },
  });
  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
