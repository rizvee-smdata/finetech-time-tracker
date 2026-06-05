import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Proposal } from "./types";
import { fmtBDT } from "./utils";

// Strip HTML tags to plain text, preserving line breaks for block elements.
function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const BRAND = {
  primary: [16, 122, 86] as [number, number, number], // SmartData emerald
  ink: [30, 41, 59] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
};

function header(doc: jsPDF, p: Proposal, pageNum: number, pageTotal: number) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...BRAND.primary);
  doc.rect(0, 0, w, 14, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("SmartData Limited", 14, 9);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(p.metadata.referenceNumber || "—", w - 14, 9, { align: "right" });

  // Footer
  const h = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...BRAND.muted);
  doc.setLineWidth(0.2);
  doc.line(14, h - 12, w - 14, h - 12);
  doc.setTextColor(...BRAND.muted);
  doc.setFontSize(8);
  doc.text("SmartData Limited · Cybersecurity & ICT Solutions, Bangladesh", 14, h - 7);
  doc.text(`Page ${pageNum} of ${pageTotal}`, w - 14, h - 7, { align: "right" });
}

export async function exportProposalPdf(p: Proposal) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const marginX = 16;
  let y = 24;

  // Cover
  doc.setTextColor(...BRAND.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  const titleLines = doc.splitTextToSize(p.title || "Proposal", w - marginX * 2);
  doc.text(titleLines, marginX, y);
  y += titleLines.length * 9 + 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.muted);
  doc.text(`Prepared for: ${p.clientCompany}`, marginX, y);
  y += 6;
  if (p.clientIndustry) {
    doc.text(`Industry: ${p.clientIndustry}`, marginX, y);
    y += 6;
  }
  doc.text(`Reference: ${p.metadata.referenceNumber}`, marginX, y);
  y += 6;
  doc.text(`Valid until: ${new Date(p.metadata.validUntil).toLocaleDateString()}`, marginX, y);
  y += 6;
  doc.text(`Prepared by: ${p.metadata.preparedBy || "—"}`, marginX, y);
  y += 10;

  if (p.executiveOneLiner) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND.primary);
    const lines = doc.splitTextToSize(`"${p.executiveOneLiner}"`, w - marginX * 2);
    doc.text(lines, marginX, y);
    y += lines.length * 6 + 4;
  }

  // Sections
  const ordered = [...p.sections].sort((a, b) => a.order - b.order);
  for (const s of ordered) {
    if (y > 250) {
      doc.addPage();
      y = 24;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...BRAND.primary);
    doc.text(s.title, marginX, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND.ink);
    const text = htmlToText(s.content);
    const lines = doc.splitTextToSize(text, w - marginX * 2);
    for (const line of lines) {
      if (y > 275) {
        doc.addPage();
        y = 24;
      }
      doc.text(line, marginX, y);
      y += 5;
    }
    y += 4;
  }

  // Pricing table
  if (p.proposedProducts.length > 0) {
    if (y > 220) {
      doc.addPage();
      y = 24;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...BRAND.primary);
    doc.text("Commercial Summary", marginX, y);
    y += 4;

    const grand = p.proposedProducts.reduce(
      (sum, x) => sum + (x.quantity * x.unitPrice - (x.quantity * x.unitPrice * x.discount) / 100),
      0,
    );

    autoTable(doc, {
      startY: y + 2,
      head: [["#", "Item", "Description", "Qty", "Unit (BDT)", "Total (BDT)"]],
      body: p.proposedProducts.map((x, i) => {
        const total = x.quantity * x.unitPrice - (x.quantity * x.unitPrice * x.discount) / 100;
        return [
          String(i + 1),
          x.name,
          x.description.slice(0, 80),
          String(x.quantity),
          fmtBDT(x.unitPrice),
          fmtBDT(total),
        ];
      }),
      foot: [["", "", "", "", "Grand Total", fmtBDT(grand)]],
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: BRAND.primary, textColor: 255 },
      footStyles: { fillColor: [240, 253, 244], textColor: BRAND.ink, fontStyle: "bold" },
      margin: { left: marginX, right: marginX },
    });
  }

  // Apply header/footer to every page
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    header(doc, p, i, total);
  }

  const safe = (p.clientCompany || "proposal").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  doc.save(`SmartData_Proposal_${safe}_${p.metadata.referenceNumber || p.id.slice(0, 6)}.pdf`);
}
