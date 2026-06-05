import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  brief: z.string().min(10).max(4000),
});

const tool = {
  type: "function" as const,
  function: {
    name: "return_brief_extraction",
    description: "Parse a plain-language sales brief into structured proposal inputs for SmartData Limited.",
    parameters: {
      type: "object",
      properties: {
        clientCompany: { type: "string" },
        clientIndustry: { type: "string" },
        decisionMakerTitle: { type: "string" },
        painPoints: { type: "array", items: { type: "string" } },
        competitors: { type: "array", items: { type: "string" } },
        recommendedTemplate: {
          type: "string",
          enum: [
            "enterprise_ict",
            "cybersecurity",
            "network_infrastructure",
            "managed_services",
            "software_solution",
            "custom",
          ],
        },
        suggestedProducts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              quantity: { type: "number" },
              unitPriceBDT: { type: "number" },
              implementationDays: { type: "number" },
              oemPartner: {
                type: "string",
                enum: [
                  "Fortinet",
                  "Rubrik",
                  "HivePro",
                  "Gambit Cyber",
                  "Gurucul",
                  "LinkShadow",
                  "Adaptiva",
                  "DEEPX",
                  "Gopher Security",
                  "SmartData Services",
                ],
              },
            },
            required: ["name", "description", "quantity", "unitPriceBDT", "implementationDays", "oemPartner"],
            additionalProperties: false,
          },
        },
        executiveOneLiner: { type: "string" },
      },
      required: [
        "clientCompany",
        "clientIndustry",
        "painPoints",
        "competitors",
        "recommendedTemplate",
        "suggestedProducts",
        "executiveOneLiner",
      ],
      additionalProperties: false,
    },
  },
};

export const extractBrief = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("AI service is not configured.");

    const sys = `You convert plain-language sales briefs from SmartData Limited reps (Bangladesh cybersecurity & ICT distributor) into structured proposal inputs. OEM partners available: Fortinet (NGFW, SD-WAN, SIEM), Rubrik (backup), HivePro (threat intel), Gambit Cyber (MSSP), Gurucul (UEBA), LinkShadow (NDR), Adaptiva (endpoint mgmt), DEEPX (edge AI), Gopher Security (app sec). Estimate realistic BDT pricing for the Bangladesh market. Always call return_brief_extraction.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `Brief:\n${data.brief}` },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "return_brief_extraction" } },
      }),
    });

    if (res.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
    if (res.status === 402) throw new Error("AI usage limit reached. Add credits in Settings.");
    if (!res.ok) {
      const t = await res.text();
      console.error("brief extract error", res.status, t);
      throw new Error(`AI service error (${res.status}).`);
    }

    const payload = await res.json();
    const argsStr = payload?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) throw new Error("AI did not return structured output.");
    return JSON.parse(argsStr) as {
      clientCompany: string;
      clientIndustry: string;
      decisionMakerTitle?: string;
      painPoints: string[];
      competitors: string[];
      recommendedTemplate:
        | "enterprise_ict"
        | "cybersecurity"
        | "network_infrastructure"
        | "managed_services"
        | "software_solution"
        | "custom";
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
  });
