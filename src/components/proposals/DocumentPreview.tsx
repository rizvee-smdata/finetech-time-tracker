import type { Proposal } from "@/lib/proposals/types";
import { PricingTable } from "./PricingTable";
import { format } from "date-fns";

export function DocumentPreview({ proposal }: { proposal: Proposal }) {
  const sections = [...proposal.sections].sort((a, b) => a.order - b.order);
  return (
    <div className="mx-auto w-full max-w-[820px] bg-white text-slate-900 shadow-2xl print:shadow-none">
      {/* Letterhead */}
      <div className="flex items-start justify-between border-b-4 border-emerald-600 px-10 py-6 print:px-12">
        <div>
          <div className="text-xl font-bold tracking-tight text-emerald-700">SmartData Limited</div>
          <div className="text-xs text-slate-600">ICT Solutions · Cybersecurity · Managed Services</div>
          <div className="mt-1 text-[11px] text-slate-500">Dhaka, Bangladesh · info@smartdata.com.bd</div>
        </div>
        <div className="text-right text-xs text-slate-600">
          <div>
            <span className="font-semibold">Ref:</span> {proposal.metadata.referenceNumber}
          </div>
          <div>
            <span className="font-semibold">Valid Until:</span>{" "}
            {format(new Date(proposal.metadata.validUntil), "dd MMM yyyy")}
          </div>
          <div className="mt-1 inline-block rounded bg-emerald-50 px-2 py-0.5 font-medium uppercase tracking-wide text-emerald-700">
            {proposal.metadata.confidentiality.replace(/_/g, " ")}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="space-y-6 px-10 py-8 print:px-12">
        {sections.map((s, idx) => (
          <section key={s.id} className="break-inside-avoid">
            {s.type !== "cover_page" && (
              <h2 className="mb-2 border-b border-slate-200 pb-1 text-lg font-semibold text-slate-900">
                {idx}. {s.title}
              </h2>
            )}
            {s.type === "pricing_table" ? (
              <PricingTable
                products={proposal.proposedProducts}
                currency={proposal.proposedProducts[0]?.currency ?? "BDT"}
                showPricing={proposal.showPricing}
              />
            ) : (
              <div
                className="prose prose-sm max-w-none prose-headings:text-slate-900 prose-p:text-slate-700 prose-li:text-slate-700 prose-strong:text-slate-900"
                dangerouslySetInnerHTML={{ __html: s.content }}
              />
            )}
          </section>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-200 px-10 py-4 text-[10px] text-slate-500 print:px-12">
        <div className="flex items-center justify-between">
          <span>
            Prepared by {proposal.metadata.preparedBy} · v{proposal.version}
          </span>
          <span>SmartData Limited · {format(new Date(proposal.updatedAt), "dd MMM yyyy")}</span>
        </div>
      </div>
    </div>
  );
}
