import type { ProposedProduct, Currency } from "@/lib/proposals/types";
import { lineTotal, grandTotal, fmtMoney } from "@/lib/proposals/utils";

export function PricingTable({
  products,
  currency,
  showPricing,
}: {
  products: ProposedProduct[];
  currency: Currency;
  showPricing: "yes" | "no" | "summary";
}) {
  if (showPricing === "no") return null;
  const total = grandTotal(products);

  if (showPricing === "summary") {
    return (
      <div className="my-4 rounded-md border border-slate-300 bg-slate-50 p-4 text-slate-900">
        <div className="text-sm text-slate-600">Total Investment</div>
        <div className="text-2xl font-bold text-emerald-600">{fmtMoney(total, currency)}</div>
      </div>
    );
  }

  return (
    <table className="my-4 w-full border-collapse text-left text-sm text-slate-800">
      <thead>
        <tr className="border-b-2 border-slate-300 bg-slate-50">
          <th className="p-2">#</th>
          <th className="p-2">Item</th>
          <th className="p-2 text-right">Qty</th>
          <th className="p-2 text-right">Unit Price</th>
          <th className="p-2 text-right">Discount</th>
          <th className="p-2 text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        {products.map((p, i) => (
          <tr key={p.id} className="border-b border-slate-200 align-top">
            <td className="p-2 text-slate-500">{i + 1}</td>
            <td className="p-2">
              <div className="font-semibold">{p.name}</div>
              <div className="text-xs text-slate-600">{p.description}</div>
            </td>
            <td className="p-2 text-right">{p.quantity}</td>
            <td className="p-2 text-right">{fmtMoney(p.unitPrice, p.currency)}</td>
            <td className="p-2 text-right">{p.discount}%</td>
            <td className="p-2 text-right font-semibold">{fmtMoney(lineTotal(p), p.currency)}</td>
          </tr>
        ))}
        <tr className="bg-emerald-50">
          <td colSpan={5} className="p-2 text-right font-semibold">
            Grand Total
          </td>
          <td className="p-2 text-right text-base font-bold text-emerald-700">
            {fmtMoney(total, currency)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
