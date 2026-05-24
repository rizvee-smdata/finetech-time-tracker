import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ProductSchema = z.object({
  name: z.string().max(300),
  description: z.string().max(2000),
  quantity: z.number(),
  unitPrice: z.number(),
  currency: z.string().max(10),
  discount: z.number(),
  totalPrice: z.number(),
  implementationDays: z.number(),
});

const SECTION_TYPES = [
  "cover_page",
  "executive_summary",
  "problem_statement",
  "proposed_solution",
  "technical_architecture",
  "implementation_plan",
  "pricing_table",
  "company_profile",
  "team_credentials",
  "case_studies",
  "terms_conditions",
  "call_to_action",
] as const;

const InputSchema = z.object({
  clientName: z.string().min(1).max(200),
  clientCompany: z.string().min(1).max(200),
  clientIndustry: z.string().max(200),
  decisionMakerName: z.string().max(200).optional(),
  decisionMakerTitle: z.string().max(200).optional(),
  painPoints: z.array(z.string().max(300)).max(20),
  competitors: z.array(z.string().max(200)).max(20),
  previousContext: z.string().max(4000).optional(),
  additionalInstructions: z.string().max(2000).optional(),
  products: z.array(ProductSchema).max(40),
  currency: z.string().max(10),
  grandTotal: z.number(),
  totalImplementationDays: z.number(),
  tone: z.enum(["formal", "consultative", "technical", "executive"]),
  language: z.enum(["english", "bengali_english_mix"]),
  template: z.string().max(60),
  selectedSections: z.array(z.enum(SECTION_TYPES)).min(1).max(20),
});

const tool = {
  type: "function" as const,
  function: {
    name: "return_proposal_draft",
    description: "Return a complete proposal draft as structured JSON.",
    parameters: {
      type: "object",
      properties: {
        referenceNumber: { type: "string" },
        proposalTitle: { type: "string" },
        executiveSummaryOneLiner: { type: "string" },
        proposalStrengths: { type: "array", items: { type: "string" } },
        suggestedValidUntil: { type: "string" },
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: [...SECTION_TYPES] },
              title: { type: "string" },
              content: { type: "string" },
            },
            required: ["type", "title", "content"],
            additionalProperties: false,
          },
        },
      },
      required: [
        "referenceNumber",
        "proposalTitle",
        "executiveSummaryOneLiner",
        "proposalStrengths",
        "suggestedValidUntil",
        "sections",
      ],
      additionalProperties: false,
    },
  },
};

export const generateProposal = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) {
      throw new Error("AI service is not configured. Please contact support.");
    }

    const userPrompt = `You are a senior business development writer for SmartData Limited, a Bangladesh-based ICT solutions and services company. Write a professional ${data.tone} proposal for the following client.

COMPANY CONTEXT:
SmartData Limited is an ICT solutions company serving enterprise and government clients in Bangladesh. Partners include Rubrik, HivePro, Gambit Cyber, LinkShadow, Gurucul, Adaptiva, and DEEPX. The company also operates under the Toovus brand.

CLIENT INFORMATION:
- Company: ${data.clientCompany}
- Industry: ${data.clientIndustry}
- Decision Maker: ${data.decisionMakerName ?? "(unknown)"}, ${data.decisionMakerTitle ?? ""}
- Pain Points: ${data.painPoints.join(", ") || "(none provided)"}
- Competitors Mentioned: ${data.competitors.join(", ") || "None"}
- Context: ${data.previousContext ?? "(none)"}

PRODUCTS/SERVICES:
${data.products
  .map(
    (p) =>
      `- ${p.name}: ${p.description} | ${p.currency} ${p.unitPrice.toLocaleString()} x ${p.quantity} = ${p.currency} ${p.totalPrice.toLocaleString()}`,
  )
  .join("\n")}

Grand Total: ${data.currency} ${data.grandTotal.toLocaleString()}
Total Implementation Days: ${data.totalImplementationDays}

SECTIONS TO WRITE: ${data.selectedSections.join(", ")}
TONE: ${data.tone}
LANGUAGE: ${data.language === "bengali_english_mix" ? "English with Bengali terms for local context where natural" : "English"}
TEMPLATE TYPE: ${data.template}
ADDITIONAL INSTRUCTIONS: ${data.additionalInstructions ?? "(none)"}

Call return_proposal_draft with:
- referenceNumber: format SDL-2026-XXXX
- proposalTitle: compelling, client-specific title
- executiveSummaryOneLiner: one powerful sentence summarizing the value proposition
- proposalStrengths: 3 differentiators
- suggestedValidUntil: ISO date 30 days from today
- sections: one entry per selected section, in the order provided. content must be HTML using <h3>, <p>, <ul>, <li>, <strong>, <table> tags. Minimum 2-4 paragraphs per section. Be specific to the client and their industry — no generic filler.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are an expert B2B proposal writer for SmartData Limited. Always respond by calling the return_proposal_draft tool.",
          },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "return_proposal_draft" } },
      }),
    });

    if (res.status === 429) {
      throw new Error("AI rate limit reached. Please wait a minute and try again.");
    }
    if (res.status === 402) {
      throw new Error("AI usage limit reached. Please add credits in Settings → Workspace → Usage.");
    }
    if (!res.ok) {
      const txt = await res.text();
      console.error("AI gateway error", res.status, txt);
      throw new Error(`AI service error (${res.status}). Please try again.`);
    }

    const payload = await res.json();
    const argsStr = payload?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) throw new Error("AI did not return structured output. Please retry.");

    return JSON.parse(argsStr) as {
      referenceNumber: string;
      proposalTitle: string;
      executiveSummaryOneLiner: string;
      proposalStrengths: string[];
      suggestedValidUntil: string;
      sections: Array<{ type: (typeof SECTION_TYPES)[number]; title: string; content: string }>;
    };
  });
