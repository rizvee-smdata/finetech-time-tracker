export type ExportRow = (string | number)[];

// The xlsx / jspdf bundles are browser-only and heavy — they are loaded on
// demand inside each helper so route modules that merely import these
// functions stay safe to evaluate during server-side rendering.
async function loadXlsx() {
  return await import("xlsx");
}

async function loadPdf() {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  return { jsPDF, autoTable };
}

export async function exportToExcel(
  filename: string,
  sheetName: string,
  header: string[],
  rows: ExportRow[],
) {
  const XLSX = await loadXlsx();
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || "Sheet1");
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

export async function exportToPDF(
  filename: string,
  title: string,
  header: string[],
  rows: ExportRow[],
) {
  const { jsPDF, autoTable } = await loadPdf();
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

export async function exportTextToPDF(filename: string, title: string, text: string) {
  const { jsPDF } = await loadPdf();
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

export async function exportTranscriptToExcel(
  filename: string,
  messages: { role: string; content: string }[],
) {
  const header = ["#", "Role", "Message"];
  const rows: ExportRow[] = messages.map((m, i) => [i + 1, m.role, m.content]);
  await exportToExcel(filename, "Chat", header, rows);
}

export async function exportTranscriptToPDF(
  filename: string,
  title: string,
  messages: { role: string; content: string }[],
) {
  const { jsPDF, autoTable } = await loadPdf();
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
