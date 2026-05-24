import type { ProposedProduct, Currency } from "./types";

export function lineTotal(p: ProposedProduct): number {
  const gross = p.quantity * p.unitPrice;
  return gross - (gross * p.discount) / 100;
}

export function grandTotal(products: ProposedProduct[]): number {
  return products.reduce((sum, p) => sum + lineTotal(p), 0);
}

export function totalImplementationDays(products: ProposedProduct[]): number {
  return products.reduce((sum, p) => sum + (p.implementationDays || 0), 0);
}

export function fmtMoney(amount: number, currency: Currency = "BDT"): string {
  const symbol = currency === "BDT" ? "BDT" : "USD";
  return `${symbol} ${Math.round(amount).toLocaleString()}`;
}

export function fmtMoneyShort(amount: number, currency: Currency = "BDT"): string {
  if (amount >= 1_00_00_000) return `${currency} ${(amount / 1_00_00_000).toFixed(2)} Cr`;
  if (amount >= 1_00_000) return `${currency} ${(amount / 1_00_000).toFixed(1)} L`;
  if (amount >= 1_000) return `${currency} ${(amount / 1_000).toFixed(1)}k`;
  return `${currency} ${Math.round(amount)}`;
}

export function statusColor(status: string): string {
  switch (status) {
    case "draft":
      return "bg-slate-500/15 text-slate-300 border-slate-500/30";
    case "ready":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "sent":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "accepted":
      return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
    case "rejected":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    default:
      return "bg-slate-500/15 text-slate-300 border-slate-500/30";
  }
}
