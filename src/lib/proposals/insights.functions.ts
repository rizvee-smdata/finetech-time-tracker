import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Outcome = z.object({
  title: z.string().max(300),
  industry: z.string().max(200),
  template: z.string().max(60),
  status: z.string().max(20),
  value: z.number(),
  daysSentToDecision: z.number().nullable(),
  executiveSummaryWordCount: z.number(),
  sectionCount: z.number(),
});

const InputSchema = z.object({
  outcomes: z.array(Outcome).max(200),
});

const tool = {
  type: "function" as const,
  function: {
    name: "return_win_patterns",
    description: "Return win/loss pattern insights for proposals.",
    parameters: {
      type: "object",
      properties: {
        headline: { type: "string" },
        winningTraits: { type: "array", items: { type: "string" } },
        losingTraits: { type: "array", items: { type: "string" } },
        actionableInsights: { type: "array", items: { type: "string" } },
      },
      required: ["headline", "winningTraits", "losingTraits", "actionableInsights"],
      additionalProperties: false,
    },
  },
};

export const analyzeProposalWins = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("AI service is not configured.");

    const userPrompt = `Analyze these proposal outcomes for SmartData Limited and surface patterns that separate winners from losers.

DATA:
${JSON.stringify(data.outcomes, null, 2)}

Call return_win_patterns with:
- headline: one sentence framing the most important pattern
- winningTraits: 3-5 specific traits of winning proposals (be quantitative when possible)
- losingTraits: 2-4 traits of losing/stalled proposals
- actionableInsights: 3-5 concrete instructions the writer should apply on the next proposal`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a proposal performance analyst. Always respond by calling return_win_patterns." },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "return_win_patterns" } },
      }),
    });

    if (res.status === 429) throw new Error("AI rate limit reached.");
    if (res.status === 402) throw new Error("AI usage limit reached. Please add credits.");
    if (!res.ok) throw new Error(`AI service error (${res.status}).`);

    const payload = await res.json();
    const argsStr = payload?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) throw new Error("AI did not return structured output.");
    return JSON.parse(argsStr) as {
      headline: string;
      winningTraits: string[];
      losingTraits: string[];
      actionableInsights: string[];
    };
  });
