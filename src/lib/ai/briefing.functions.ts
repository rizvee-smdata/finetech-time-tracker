import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const DealLite = z.object({
  id: z.string(),
  title: z.string(),
  clientCompany: z.string(),
  stage: z.string(),
  dealValue: z.number(),
  currency: z.string(),
  healthScore: z.number().optional(),
  healthStatus: z.string().optional(),
  daysSinceContact: z.number(),
  probability: z.number().optional(),
  lastNote: z.string().optional(),
  competitors: z.array(z.string()).optional(),
});

const Input = z.object({
  userName: z.string().max(120).optional(),
  deals: z.array(DealLite).max(60),
  proposalsOpen: z.number(),
  todayActions: z.number(),
  wonThisMonthValue: z.number(),
  pipelineValue: z.number(),
  currency: z.string().max(8),
});

const briefingTool = {
  type: "function" as const,
  function: {
    name: "return_briefing",
    description: "Return today's sales briefing for this rep.",
    parameters: {
      type: "object",
      properties: {
        headline: { type: "string", description: "1-sentence summary of today's priority." },
        focusDeals: {
          type: "array",
          description: "Top 3 deals to focus on today.",
          items: {
            type: "object",
            properties: {
              dealId: { type: "string" },
              clientCompany: { type: "string" },
              why: { type: "string", description: "Why this deal matters today (1 sentence)." },
              suggestedAction: { type: "string", description: "Concrete next action." },
              talkingPoints: {
                type: "array",
                items: { type: "string" },
                description: "2-4 short talking points / questions to bring up.",
              },
            },
            required: ["dealId", "clientCompany", "why", "suggestedAction", "talkingPoints"],
            additionalProperties: false,
          },
        },
        risks: {
          type: "array",
          items: { type: "string" },
          description: "Top risks across pipeline (3-5 bullets).",
        },
        opportunities: {
          type: "array",
          items: { type: "string" },
          description: "Opportunities to accelerate (2-4 bullets).",
        },
        coachingTip: { type: "string", description: "One concise coaching tip for the rep today." },
        moraleLine: { type: "string", description: "One short motivating line." },
      },
      required: ["headline", "focusDeals", "risks", "opportunities", "coachingTip", "moraleLine"],
      additionalProperties: false,
    },
  },
};

const SYSTEM = `You are DeskIQ Sales Prep — an AI sales coach for a Bangladeshi B2B sales/BD professional.
Generate a tactical morning briefing the rep reads BEFORE making calls / visits today.
Be terse, specific, and actionable. Use USD ($) when discussing money. Use plain English, no fluff.
Only reference dealIds that exist in the input. Prioritize stalling deals, high-value at-risk deals, and easy wins.`;

export const generateBriefing = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI service is not configured.");

    const userMsg = `Rep: ${data.userName ?? "(unknown)"}
Pipeline value: ${data.currency} ${data.pipelineValue.toLocaleString()}
Won this month: ${data.currency} ${data.wonThisMonthValue.toLocaleString()}
Open proposals: ${data.proposalsOpen}
Actions due today: ${data.todayActions}

Deals (${data.deals.length}):
${JSON.stringify(data.deals, null, 2)}

Produce today's briefing.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userMsg },
        ],
        tools: [briefingTool],
        tool_choice: { type: "function", function: { name: "return_briefing" } },
      }),
    });
    if (res.status === 429) throw new Error("AI is rate-limited — try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Workspace → Usage.");
    if (!res.ok) throw new Error(`AI service error (${res.status}).`);

    const payload = await res.json();
    const args = payload?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI returned no briefing.");
    return JSON.parse(args) as {
      headline: string;
      focusDeals: {
        dealId: string;
        clientCompany: string;
        why: string;
        suggestedAction: string;
        talkingPoints: string[];
      }[];
      risks: string[];
      opportunities: string[];
      coachingTip: string;
      moraleLine: string;
    };
  });
