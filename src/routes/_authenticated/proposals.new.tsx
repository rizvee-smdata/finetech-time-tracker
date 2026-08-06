import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";

import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { useDealsStore } from "@/lib/deals/storage";
import { useProposalsStore, useWizardDraft, proposalUid } from "@/lib/proposals/storage";
import {
  INDUSTRIES,
  LOCKED_SECTIONS,
  SECTION_LABELS,
  TEMPLATE_META,
  TONE_META,
} from "@/lib/proposals/templates";
import type {
  PricingMode,
  Proposal,
  ProposalLanguage,
  ProposalTemplate,
  ProposalTone,
  ProposedProduct,
  SectionType,
} from "@/lib/proposals/types";
import { fmtMoney, grandTotal, lineTotal, totalImplementationDays } from "@/lib/proposals/utils";
import { generateProposal } from "@/lib/proposals/generate.functions";

export const Route = createFileRoute("/_authenticated/proposals/new")({
  validateSearch: (search: Record<string, unknown>): { fromDeal?: string } =>
    typeof search.fromDeal === "string" ? { fromDeal: search.fromDeal } : {},
  component: ProposalWizardPage,
});


const STEPS = [
  { id: 1, label: "Client Info" },
  { id: 2, label: "Products & Pricing" },
  { id: 3, label: "Context & Tone" },
  { id: 4, label: "Generate" },
  { id: 5, label: "Review" },
] as const;

type WizardState = {
  step: number;
  dealId?: string;
  clientName: string;
  clientCompany: string;
  clientIndustry: string;
  decisionMakerName: string;
  decisionMakerTitle: string;
  clientWebsite: string;
  painPoints: string[];
  previousContext: string;
  competitors: string[];
  products: ProposedProduct[];
  pricingMode: PricingMode;
  showPricing: "yes" | "no" | "summary";
  template: ProposalTemplate;
  tone: ProposalTone;
  language: ProposalLanguage;
  selectedSections: SectionType[];
  additionalInstructions: string;
};

const initialState: WizardState = {
  step: 1,
  clientName: "",
  clientCompany: "",
  clientIndustry: "Banking",
  decisionMakerName: "",
  decisionMakerTitle: "",
  clientWebsite: "",
  painPoints: [],
  previousContext: "",
  competitors: [],
  products: [],
  pricingMode: "fixed",
  showPricing: "yes",
  template: "enterprise_ict",
  tone: "consultative",
  language: "english",
  selectedSections: TEMPLATE_META.enterprise_ict.sections,
  additionalInstructions: "",
};

function ProposalWizardPage() {
  const router = useRouter();
  const { deals } = useDealsStore();
  const { upsert } = useProposalsStore();
  const { draft, save } = useWizardDraft();
  const generate = useServerFn(generateProposal);
  const { fromDeal } = Route.useSearch();

  const [state, setState] = useState<WizardState>(() => {
    if (draft?.data) {
      return { ...initialState, ...(draft.data as Partial<WizardState>), step: draft.step ?? 1 };
    }
    return initialState;
  });
  const [generating, setGenerating] = useState(false);
  const [genIndex, setGenIndex] = useState(-1);
  const [resultProposal, setResultProposal] = useState<Proposal | null>(null);

  // Prefill from deal via search params (one-shot)
  useEffect(() => {
    if (fromDeal) {
      const d = deals.find((x) => x.id === fromDeal);
      if (d) {
        const painPoints = d.interactions
          .slice(-5)
          .map((i) => i.notes)
          .filter(Boolean)
          .slice(0, 5);
        const nbaContext = (d.nextBestActions ?? [])
          .filter((a) => !a.completed)
          .slice(0, 3)
          .map((a) => `• ${a.action} — ${a.reasoning}`)
          .join("\n");
        setState((s) => ({
          ...s,
          dealId: d.id,
          clientName: d.clientName,
          clientCompany: d.clientCompany,
          clientIndustry: d.industry || s.clientIndustry,
          competitors: d.competitors ?? s.competitors,
          painPoints: painPoints.length ? painPoints : s.painPoints,
          additionalInstructions: nbaContext
            ? `Next best actions context:\n${nbaContext}`
            : s.additionalInstructions,
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDeal, deals.length]);

  // Prefill from Quick Brief seed (sessionStorage)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem("deskiq_proposal_brief_seed");
    if (!raw) return;
    try {
      const seed = JSON.parse(raw) as {
        brief: string;
        extraction: {
          clientCompany: string;
          clientIndustry: string;
          decisionMakerTitle?: string;
          painPoints: string[];
          competitors: string[];
          recommendedTemplate: ProposalTemplate;
          suggestedProducts: Array<{
            name: string;
            description: string;
            quantity: number;
            unitPriceBDT: number;
            implementationDays: number;
            oemPartner: string;
          }>;
          executiveOneLiner: string;
        };
        at: number;
      };
      sessionStorage.removeItem("deskiq_proposal_brief_seed");
      const ex = seed.extraction;
      setState((s) => ({
        ...s,
        clientCompany: ex.clientCompany || s.clientCompany,
        clientName: s.clientName || ex.clientCompany,
        clientIndustry: ex.clientIndustry || s.clientIndustry,
        decisionMakerTitle: ex.decisionMakerTitle || s.decisionMakerTitle,
        painPoints: ex.painPoints?.length ? ex.painPoints : s.painPoints,
        competitors: ex.competitors?.length ? ex.competitors : s.competitors,
        template: ex.recommendedTemplate || s.template,
        selectedSections: TEMPLATE_META[ex.recommendedTemplate]?.sections ?? s.selectedSections,
        additionalInstructions: [
          s.additionalInstructions,
          `Original brief: ${seed.brief}`,
          `Headline: ${ex.executiveOneLiner}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
        products: ex.suggestedProducts.map((p) => ({
          id: proposalUid(),
          name: `${p.oemPartner} — ${p.name}`,
          description: p.description,
          quantity: p.quantity,
          unitPrice: p.unitPriceBDT,
          currency: "BDT" as const,
          discount: 0,
          totalPrice: p.quantity * p.unitPriceBDT,
          implementationDays: p.implementationDays,
        })),
      }));
      toast.success("Brief loaded — review and refine before generating");
    } catch {
      // ignore malformed seed
    }
  }, []);




  // persist draft
  useEffect(() => {
    save({ step: state.step, data: state as unknown as Partial<Proposal>, updatedAt: new Date().toISOString() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const update = <K extends keyof WizardState>(k: K, v: WizardState[K]) => setState((s) => ({ ...s, [k]: v }));
  const goto = (step: number) => setState((s) => ({ ...s, step }));

  const canNext = useMemo(() => {
    if (state.step === 1) return !!(state.clientName && state.clientCompany && state.clientIndustry);
    if (state.step === 2) return state.products.length > 0;
    if (state.step === 3) return state.selectedSections.length > 0;
    return true;
  }, [state]);

  function importDeal(dealId: string) {
    const d = deals.find((x) => x.id === dealId);
    if (!d) return;
    setState((s) => ({
      ...s,
      dealId: d.id,
      clientName: d.clientName,
      clientCompany: d.clientCompany,
      clientIndustry: d.industry || s.clientIndustry,
      competitors: d.competitors ?? s.competitors,
    }));
    toast.success(`Imported from ${d.clientCompany}`);
  }

  async function runGeneration() {
    setGenerating(true);
    setGenIndex(0);
    const sections = state.selectedSections;
    // simulate per-section typing while AI request runs
    let cancelled = false;
    const tick = async () => {
      for (let i = 0; i < sections.length; i++) {
        if (cancelled) return;
        setGenIndex(i);
        await new Promise((r) => setTimeout(r, 500));
      }
    };
    const animPromise = tick();

    try {
      const total = grandTotal(state.products);
      const currency = state.products[0]?.currency ?? "BDT";
      const res = await generate({
        data: {
          clientName: state.clientName,
          clientCompany: state.clientCompany,
          clientIndustry: state.clientIndustry,
          decisionMakerName: state.decisionMakerName || undefined,
          decisionMakerTitle: state.decisionMakerTitle || undefined,
          painPoints: state.painPoints,
          competitors: state.competitors,
          previousContext: state.previousContext || undefined,
          additionalInstructions: state.additionalInstructions || undefined,
          products: state.products.map((p) => ({
            name: p.name,
            description: p.description,
            quantity: p.quantity,
            unitPrice: p.unitPrice,
            currency: p.currency,
            discount: p.discount,
            totalPrice: lineTotal(p),
            implementationDays: p.implementationDays,
          })),
          currency,
          grandTotal: total,
          totalImplementationDays: totalImplementationDays(state.products),
          tone: state.tone,
          language: state.language,
          template: state.template,
          selectedSections: state.selectedSections,
        },
      });
      await animPromise;

      // assemble proposal
      const proposal: Proposal = {
        id: proposalUid(),
        title: res.proposalTitle,
        dealId: state.dealId,
        clientName: state.clientName,
        clientCompany: state.clientCompany,
        clientIndustry: state.clientIndustry,
        decisionMakerName: state.decisionMakerName || undefined,
        decisionMakerTitle: state.decisionMakerTitle || undefined,
        clientWebsite: state.clientWebsite || undefined,
        clientPainPoints: state.painPoints,
        previousContext: state.previousContext || undefined,
        competitors: state.competitors,
        proposedProducts: state.products,
        pricingMode: state.pricingMode,
        showPricing: state.showPricing,
        template: state.template,
        tone: state.tone,
        language: state.language,
        additionalInstructions: state.additionalInstructions || undefined,
        sections: res.sections.map((s, i) => ({
          id: proposalUid(),
          type: s.type as SectionType,
          title: s.title,
          content: s.content,
          aiGenerated: true,
          edited: false,
          locked: LOCKED_SECTIONS.includes(s.type as SectionType),
          order: i,
        })),
        status: "draft",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        history: [],
        executiveOneLiner: res.executiveSummaryOneLiner,
        proposalStrengths: res.proposalStrengths,
        metadata: {
          validUntil: res.suggestedValidUntil,
          preparedBy: "You",
          referenceNumber: res.referenceNumber,
          confidentiality: "confidential",
        },
      };
      setResultProposal(proposal);
      goto(5);
    } catch (e) {
      cancelled = true;
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function finalize(status: "draft" | "ready") {
    if (!resultProposal) return;
    const saved = upsert({ ...resultProposal, status }, "Created via wizard");
    save(null); // clear draft
    toast.success(status === "ready" ? "Marked as ready" : "Saved as draft");
    router.navigate({ to: "/proposals/$proposalId", params: { proposalId: saved.id } });
  }

  return (
    <div className="space-y-6">
      <Stepper step={state.step} />

      {state.step === 1 && (
        <Step1Client state={state} update={update} deals={deals} importDeal={importDeal} />
      )}
      {state.step === 2 && <Step2Products state={state} update={update} />}
      {state.step === 3 && <Step3Context state={state} update={update} />}
      {state.step === 4 && (
        <Step4Generate
          state={state}
          generating={generating}
          genIndex={genIndex}
          onStart={runGeneration}
        />
      )}
      {state.step === 5 && resultProposal && (
        <Step5Review proposal={resultProposal} setProposal={setResultProposal} onFinalize={finalize} />
      )}

      {state.step < 4 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => {
              if (state.step > 1) goto(state.step - 1);
              else router.history.back();
            }}
          >
            <ChevronLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <Button
            disabled={!canNext}
            className="bg-emerald-500 hover:bg-emerald-600"
            onClick={() => goto(state.step + 1)}
          >
            Next <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}

      {state.step === 4 && !generating && (
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => goto(3)}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <Button className="bg-emerald-500 hover:bg-emerald-600" onClick={runGeneration}>
            <Sparkles className="mr-2 h-4 w-4" /> Generate Proposal
          </Button>
        </div>
      )}
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto rounded-lg border border-border/60 bg-card/40 p-3 backdrop-blur">
      {STEPS.map((s, i) => {
        const active = step === s.id;
        const done = step > s.id;
        return (
          <div key={s.id} className="flex items-center gap-2">
            <div
              className={cn(
                "grid h-7 w-7 place-items-center rounded-full text-xs font-semibold",
                done ? "bg-emerald-500 text-white" : active ? "bg-emerald-500/20 text-emerald-300 ring-2 ring-emerald-500/50" : "bg-muted text-muted-foreground",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : s.id}
            </div>
            <span className={cn("whitespace-nowrap text-sm", active ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && <div className="h-px w-6 bg-border md:w-10" />}
          </div>
        );
      })}
    </div>
  );
}

function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState("");
  return (
    <div>
      <div className="mb-1 flex flex-wrap gap-1">
        {value.map((t) => (
          <Badge key={t} variant="secondary" className="gap-1">
            {t}
            <button onClick={() => onChange(value.filter((x) => x !== t))}>
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <Input
        placeholder={placeholder}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === ",") && input.trim()) {
            e.preventDefault();
            if (!value.includes(input.trim())) onChange([...value, input.trim()]);
            setInput("");
          }
        }}
      />
    </div>
  );
}

function Step1Client({
  state,
  update,
  deals,
  importDeal,
}: {
  state: WizardState;
  update: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
  deals: ReturnType<typeof useDealsStore>["deals"];
  importDeal: (id: string) => void;
}) {
  return (
    <Card className="border-border/60 bg-card/40 backdrop-blur">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label className="mb-1 block text-xs">Import from existing deal</Label>
            <Select onValueChange={importDeal}>
              <SelectTrigger><SelectValue placeholder="Pick a deal to auto-fill client info" /></SelectTrigger>
              <SelectContent>
                {deals.length === 0 ? (
                  <SelectItem value="_none" disabled>No deals available</SelectItem>
                ) : (
                  deals.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.clientCompany} — {d.title}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label className="mb-1 block text-xs">Client Name *</Label>
            <Input value={state.clientName} onChange={(e) => update("clientName", e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Client Company *</Label>
            <Input value={state.clientCompany} onChange={(e) => update("clientCompany", e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Industry *</Label>
            <Select value={state.clientIndustry} onValueChange={(v) => update("clientIndustry", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Client Website</Label>
            <Input value={state.clientWebsite} onChange={(e) => update("clientWebsite", e.target.value)} placeholder="https://" />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Decision Maker Name</Label>
            <Input value={state.decisionMakerName} onChange={(e) => update("decisionMakerName", e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Decision Maker Title</Label>
            <Input value={state.decisionMakerTitle} onChange={(e) => update("decisionMakerTitle", e.target.value)} />
          </div>
        </div>

        <div>
          <Label className="mb-1 block text-xs">Key Pain Points</Label>
          <TagInput
            value={state.painPoints}
            onChange={(v) => update("painPoints", v)}
            placeholder="e.g. Legacy system integration, High downtime, Security compliance"
          />
        </div>

        <div>
          <Label className="mb-1 block text-xs">Previous Interactions / Context</Label>
          <Textarea
            rows={3}
            value={state.previousContext}
            onChange={(e) => update("previousContext", e.target.value)}
            placeholder="Paste any relevant context from past meetings"
          />
        </div>

        <div>
          <Label className="mb-1 block text-xs">Competitors Mentioned</Label>
          <TagInput value={state.competitors} onChange={(v) => update("competitors", v)} placeholder="Cisco, F5, …" />
        </div>
      </CardContent>
    </Card>
  );
}

function Step2Products({
  state,
  update,
}: {
  state: WizardState;
  update: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
}) {
  const [form, setForm] = useState<Omit<ProposedProduct, "id" | "totalPrice">>({
    name: "",
    description: "",
    quantity: 1,
    unitPrice: 0,
    currency: "BDT",
    discount: 0,
    implementationDays: 0,
  });

  const add = () => {
    if (!form.name || form.unitPrice <= 0) {
      toast.error("Add a name and a unit price");
      return;
    }
    const p: ProposedProduct = {
      id: proposalUid(),
      ...form,
      totalPrice: form.quantity * form.unitPrice * (1 - form.discount / 100),
    };
    update("products", [...state.products, p]);
    setForm({ ...form, name: "", description: "", quantity: 1, unitPrice: 0, discount: 0, implementationDays: 0 });
  };

  const total = grandTotal(state.products);
  const currency = state.products[0]?.currency ?? form.currency;

  return (
    <div className="space-y-4">
      <Card className="border-border/60 bg-card/40 backdrop-blur">
        <CardContent className="space-y-3 p-6">
          <div className="text-sm font-semibold">+ Add Product/Service</div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="mb-1 block text-xs">Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Implementation Days</Label>
              <Input type="number" value={form.implementationDays} onChange={(e) => setForm({ ...form, implementationDays: Number(e.target.value) })} />
            </div>
            <div className="md:col-span-2">
              <Label className="mb-1 block text-xs">Description</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Quantity</Label>
              <Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Unit Price ({form.currency})</Label>
              <div className="flex gap-2">
                <Input type="number" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: Number(e.target.value) })} />
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v as "BDT" | "USD" | "EUR" })}>
                  <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BDT">BDT ৳</SelectItem>
                    <SelectItem value="USD">USD $</SelectItem>
                    <SelectItem value="EUR">EUR €</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="md:col-span-2">
              <Label className="mb-1 block text-xs">Discount: {form.discount}%</Label>
              <Slider value={[form.discount]} max={30} step={1} onValueChange={(v) => setForm({ ...form, discount: v[0] })} />
            </div>
          </div>
          <Button onClick={add} className="bg-emerald-500 hover:bg-emerald-600">
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </CardContent>
      </Card>

      {state.products.length > 0 && (
        <Card className="border-border/60 bg-card/40 backdrop-blur">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-border/60 text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 text-left">Item</th>
                  <th className="p-3 text-right">Qty</th>
                  <th className="p-3 text-right">Unit</th>
                  <th className="p-3 text-right">Disc</th>
                  <th className="p-3 text-right">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.products.map((p) => (
                  <tr key={p.id} className="border-b border-border/40 align-top">
                    <td className="p-3">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.description}</div>
                    </td>
                    <td className="p-3 text-right">{p.quantity}</td>
                    <td className="p-3 text-right">{fmtMoney(p.unitPrice, p.currency)}</td>
                    <td className="p-3 text-right">{p.discount}%</td>
                    <td className="p-3 text-right font-semibold text-emerald-400">{fmtMoney(lineTotal(p), p.currency)}</td>
                    <td className="p-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => update("products", state.products.filter((x) => x.id !== p.id))}>
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={4} className="p-3 text-right text-sm font-semibold">Grand Total</td>
                  <td className="p-3 text-right text-lg font-bold text-emerald-400">{fmtMoney(total, currency)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/60 bg-card/40 backdrop-blur">
        <CardContent className="grid gap-4 p-6 md:grid-cols-2">
          <div>
            <Label className="mb-1 block text-xs">Pricing Mode</Label>
            <Select value={state.pricingMode} onValueChange={(v) => update("pricingMode", v as PricingMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Fixed Price</SelectItem>
                <SelectItem value="time_materials">Time &amp; Materials</SelectItem>
                <SelectItem value="subscription">Subscription / Annual Contract</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Show pricing in proposal</Label>
            <Select value={state.showPricing} onValueChange={(v) => update("showPricing", v as "yes" | "no" | "summary")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes — full table</SelectItem>
                <SelectItem value="summary">Summary only</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Step3Context({
  state,
  update,
}: {
  state: WizardState;
  update: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
}) {
  const allSectionTypes = Array.from(new Set(Object.keys(SECTION_LABELS))) as SectionType[];
  return (
    <div className="space-y-4">
      <Card className="border-border/60 bg-card/40 backdrop-blur">
        <CardContent className="space-y-3 p-6">
          <div className="text-sm font-semibold">Template</div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(Object.keys(TEMPLATE_META) as ProposalTemplate[]).map((k) => {
              const m = TEMPLATE_META[k];
              const active = state.template === k;
              return (
                <button
                  key={k}
                  onClick={() => {
                    update("template", k);
                    update("selectedSections", m.sections);
                  }}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    active ? "border-emerald-500/60 bg-emerald-500/10" : "border-border/60 bg-card/40 hover:border-emerald-500/30",
                  )}
                >
                  <div className="text-lg">{m.icon}</div>
                  <div className="text-sm font-semibold">{m.label}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{m.bestFor}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {m.sections.length} sections · {m.typicalPages}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/40 backdrop-blur">
        <CardContent className="space-y-3 p-6">
          <div className="text-sm font-semibold">Tone</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(TONE_META) as ProposalTone[]).map((k) => {
              const m = TONE_META[k];
              const active = state.tone === k;
              return (
                <button
                  key={k}
                  onClick={() => update("tone", k)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    active ? "border-emerald-500/60 bg-emerald-500/10" : "border-border/60 bg-card/40 hover:border-emerald-500/30",
                  )}
                >
                  <div className="text-lg">{m.icon}</div>
                  <div className="text-sm font-semibold">{m.label}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{m.description}</div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/40 backdrop-blur">
        <CardContent className="space-y-3 p-6">
          <div className="text-sm font-semibold">Sections to Include</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {allSectionTypes.map((t) => {
              const locked = LOCKED_SECTIONS.includes(t);
              const checked = state.selectedSections.includes(t);
              return (
                <label key={t} className={cn("flex items-center gap-2 rounded-md border border-border/60 p-2 text-sm", locked && "opacity-90")}>
                  <Checkbox
                    checked={checked || locked}
                    disabled={locked}
                    onCheckedChange={(v) => {
                      if (locked) return;
                      if (v) update("selectedSections", [...state.selectedSections, t]);
                      else update("selectedSections", state.selectedSections.filter((x) => x !== t));
                    }}
                  />
                  <span className="flex-1">{SECTION_LABELS[t]}</span>
                  {locked && <Badge variant="outline" className="text-[10px]">required</Badge>}
                </label>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/40 backdrop-blur">
        <CardContent className="space-y-3 p-6">
          <div>
            <Label className="mb-1 block text-xs">Additional Instructions</Label>
            <Textarea
              rows={3}
              value={state.additionalInstructions}
              onChange={(e) => update("additionalInstructions", e.target.value)}
              placeholder="e.g. Mention our Rubrik partnership, avoid mentioning competitor X by name, emphasize 24/7 support"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Language</Label>
            <RadioGroup value={state.language} onValueChange={(v) => update("language", v as ProposalLanguage)} className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-md border border-border/60 p-2 text-sm">
                <RadioGroupItem value="english" /> English only
              </label>
              <label className="flex items-center gap-2 rounded-md border border-border/60 p-2 text-sm">
                <RadioGroupItem value="bengali_english_mix" /> English with Bengali terms
              </label>
            </RadioGroup>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Step4Generate({
  state,
  generating,
  genIndex,
  onStart,
}: {
  state: WizardState;
  generating: boolean;
  genIndex: number;
  onStart: () => void;
}) {
  return (
    <Card className="border-border/60 bg-card/40 backdrop-blur">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-emerald-400" />
          <div>
            <div className="text-sm font-semibold">AI Generation</div>
            <div className="text-xs text-muted-foreground">
              Writing {state.selectedSections.length} sections for {state.clientCompany || "your client"} in a {state.tone} tone.
            </div>
          </div>
        </div>

        <div className="space-y-1">
          {state.selectedSections.map((s, i) => {
            const done = generating && i < genIndex;
            const active = generating && i === genIndex;
            return (
              <div key={s} className="flex items-center gap-2 rounded-md border border-border/40 px-3 py-2 text-sm">
                {done ? (
                  <Check className="h-4 w-4 text-emerald-400" />
                ) : active ? (
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                ) : (
                  <div className="h-4 w-4 rounded-sm border border-border" />
                )}
                <span className={cn(done ? "text-foreground" : active ? "text-foreground" : "text-muted-foreground")}>
                  {SECTION_LABELS[s]}
                </span>
                {active && <span className="ml-auto text-xs text-muted-foreground">writing…</span>}
              </div>
            );
          })}
        </div>

        {!generating && (
          <div className="text-xs text-muted-foreground">
            Ready when you are. Click <strong>Generate Proposal</strong> below to call the AI.
          </div>
        )}
        {generating && (
          <div className="text-xs text-emerald-400">Generating… this typically takes 10-30 seconds.</div>
        )}
      </CardContent>
    </Card>
  );
}

function Step5Review({
  proposal,
  setProposal,
  onFinalize,
}: {
  proposal: Proposal;
  setProposal: (p: Proposal) => void;
  onFinalize: (status: "draft" | "ready") => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <Card className="border-border/60 bg-card/40 backdrop-blur">
        <CardContent className="space-y-3 p-4">
          <div className="text-sm font-semibold">Sections</div>
          {proposal.sections.map((s) => (
            <div key={s.id} className="rounded-md border border-border/60 p-2 text-sm">
              <div className="flex items-center justify-between">
                <div className="font-medium">{s.title}</div>
                <Badge variant="outline" className="text-[10px]">{s.aiGenerated ? "AI" : "Manual"}</Badge>
              </div>
              <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {s.content.replace(/<[^>]+>/g, " ").slice(0, 160)}…
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="outline" onClick={() => onFinalize("draft")}>Save as Draft</Button>
            <Button className="bg-emerald-500 hover:bg-emerald-600" onClick={() => onFinalize("ready")}>
              <Check className="mr-1 h-4 w-4" /> Mark as Ready
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="max-h-[80vh] overflow-auto rounded-lg bg-slate-200 p-4">
        {/* lightweight preview */}
        <PreviewLite proposal={proposal} />
      </div>
    </div>
  );
}

// lazy import to avoid circular
import { DocumentPreview } from "@/components/proposals/DocumentPreview";
function PreviewLite({ proposal }: { proposal: Proposal }) {
  return <DocumentPreview proposal={proposal} />;
}
