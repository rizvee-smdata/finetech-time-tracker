import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { TIME_CATEGORIES } from "./types";

const InputSchema = z.object({
  description: z.string().min(1).max(2000),
  deals: z.array(z.object({
    id: z.string().max(100),
    title: z.string().max(300),
    clientCompany: z.string().max(200),
  })).max(50),
});

const tool = {
  type: "function" as const,
  function: {
    name: "classify_time_entry",
    description: "Classify a time tracking work description.",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", enum: TIME_CATEGORIES as unknown as string[] },
        billable: { type: "boolean" },
        suggestedDealId: { type: "string", description: "Deal ID, or empty string if none." },
        suggestedClientName: { type: "string", description: "Client company name or empty string." },
        tags: { type: "array", items: { type: "string" } },
        confidence: { type: "number" },
      },
      required: ["category", "billable", "suggestedDealId", "suggestedClientName", "tags", "confidence"],
      additionalProperties: false,
    },
  },
};

export const classifyTimeEntry = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI service is not configured.");

    const prompt = `You are a time tracking assistant for a Bangladesh-based ICT solutions company in business development.

Classify this work description: "${data.description}"

Available deals:
${JSON.stringify(data.deals)}

Rules:
- Pick the single best category from the enum.
- billable=true for client-facing or revenue-generating work (Pre-Sales, Proposal Writing, Client Meeting, Technical Demo, Follow-up). billable=false for Internal Meeting, Admin, Research, Partner Management unless directly chargeable.
- If the description clearly references a deal/company, return its id in suggestedDealId. Otherwise empty string.
- tags: 2-4 short lowercase keywords.
- confidence: 0-100.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Always respond by calling classify_time_entry." },
          { role: "user", content: prompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "classify_time_entry" } },
      }),
    });
    if (res.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
    if (res.status === 402) throw new Error("AI usage limit reached. Add credits in Settings → Workspace → Usage.");
    if (!res.ok) {
      const t = await res.text();
      console.error("AI classify error", res.status, t);
      throw new Error(`AI service error (${res.status}).`);
    }
    const payload = await res.json();
    const args = payload?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI did not return structured output.");
    return JSON.parse(args) as {
      category: string;
      billable: boolean;
      suggestedDealId: string;
      suggestedClientName: string;
      tags: string[];
      confidence: number;
    };
  });
