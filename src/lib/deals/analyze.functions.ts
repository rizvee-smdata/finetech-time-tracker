import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InteractionSchema = z.object({
  type: z.string().max(50),
  date: z.string().max(100),
  notes: z.string().max(2000),
  sentiment: z.enum(["positive", "neutral", "negative"]),
});

const InputSchema = z.object({
  title: z.string().min(1).max(300),
  clientName: z.string().min(1).max(200),
  clientCompany: z.string().min(1).max(200),
  industry: z.string().max(200),
  dealValue: z.number(),
  currency: z.string().max(10),
  stage: z.string().max(50),
  daysSinceContact: z.number(),
  healthScore: z.number(),
  healthStatus: z.string().max(20),
  competitors: z.array(z.string().max(200)).max(20),
  products: z.array(z.string().max(200)).max(20),
  interactions: z.array(InteractionSchema).max(20),
  breakdown: z.object({
    recencyScore: z.number(),
    engagementScore: z.number(),
    momentumScore: z.number(),
    sentimentScore: z.number(),
  }),
});

const tool = {
  type: "function" as const,
  function: {
    name: "return_deal_analysis",
    description: "Return structured deal coaching analysis.",
    parameters: {
      type: "object",
      properties: {
        dealDiagnosis: { type: "string" },
        winProbability: { type: "number" },
        estimatedCloseDate: { type: "string" },
        riskFactors: { type: "array", items: { type: "string" } },
        positiveSignals: { type: "array", items: { type: "string" } },
        nextBestActions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              priority: { type: "number", enum: [1, 2, 3] },
              actionType: {
                type: "string",
                enum: ["call", "email", "meeting", "proposal", "escalate", "demo"],
              },
              action: { type: "string" },
              reasoning: { type: "string" },
              urgency: { type: "string", enum: ["today", "this_week", "this_month"] },
              estimatedImpact: { type: "string", enum: ["high", "medium", "low"] },
              draftContent: { type: "string" },
            },
            required: [
              "priority",
              "actionType",
              "action",
              "reasoning",
              "urgency",
              "estimatedImpact",
              "draftContent",
            ],
            additionalProperties: false,
          },
        },
        competitorStrategy: { type: "string" },
        dealCoachingTip: { type: "string" },
      },
      required: [
        "dealDiagnosis",
        "winProbability",
        "estimatedCloseDate",
        "riskFactors",
        "positiveSignals",
        "nextBestActions",
        "competitorStrategy",
        "dealCoachingTip",
      ],
      additionalProperties: false,
    },
  },
};

export const analyzeDeal = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) {
      throw new Error("AI service is not configured. Please contact support.");
    }

    const userPrompt = `You are an expert B2B sales coach analyzing a deal for a Bangladesh-based ICT solutions company.

Deal Information:
- Title: ${data.title}
- Client: ${data.clientName}, ${data.clientCompany}
- Industry: ${data.industry}
- Value: ${data.currency} ${data.dealValue.toLocaleString()}
- Stage: ${data.stage}
- Days Since Last Contact: ${data.daysSinceContact}
- Health Score: ${data.healthScore}/100 (${data.healthStatus})
- Competitors: ${data.competitors.join(", ") || "None identified"}
- Products: ${data.products.join(", ")}

Recent Interactions (last 5):
${data.interactions
  .slice(-5)
  .map(
    (i) =>
      `- ${i.type} on ${i.date}: ${i.notes} [${i.sentiment}]`,
  )
  .join("\n")}

Score Breakdown:
- Recency: ${data.breakdown.recencyScore}/25
- Engagement: ${data.breakdown.engagementScore}/25
- Momentum: ${data.breakdown.momentumScore}/25
- Sentiment: ${data.breakdown.sentimentScore}/25

Call return_deal_analysis with:
- dealDiagnosis: 2-3 sentence honest assessment of deal health and what is causing the score
- winProbability: realistic 0-100 number
- estimatedCloseDate: specific date estimate (e.g. "2025-03-15")
- riskFactors: 2-4 specific risks
- positiveSignals: 2-4 specific positive signals
- nextBestActions: 3-5 ranked actions, each with a fully written draftContent (email body, call script, or message — no placeholders)
- competitorStrategy: specific advice on handling identified competitors
- dealCoachingTip: one powerful insight the sales person might be missing`;

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
              "You are an expert B2B sales coach. Always respond by calling the return_deal_analysis tool.",
          },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "return_deal_analysis" } },
      }),
    });

    if (res.status === 429) {
      throw new Error("AI rate limit reached. Please wait a minute and try again.");
    }
    if (res.status === 402) {
      throw new Error(
        "AI usage limit reached. Please add credits in Settings → Workspace → Usage.",
      );
    }
    if (!res.ok) {
      const txt = await res.text();
      console.error("AI gateway error", res.status, txt);
      throw new Error(`AI service error (${res.status}). Please try again.`);
    }

    const payload = await res.json();
    const toolCall = payload?.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = toolCall?.function?.arguments;
    if (!argsStr) {
      console.error("No tool call in AI response", JSON.stringify(payload));
      throw new Error("AI did not return structured output. Please retry.");
    }

    let parsed;
    try {
      parsed = JSON.parse(argsStr);
    } catch {
      throw new Error("AI returned invalid JSON. Please retry.");
    }

    return parsed as {
      dealDiagnosis: string;
      winProbability: number;
      estimatedCloseDate: string;
      riskFactors: string[];
      positiveSignals: string[];
      nextBestActions: Array<{
        priority: 1 | 2 | 3;
        actionType: "call" | "email" | "meeting" | "proposal" | "escalate" | "demo";
        action: string;
        reasoning: string;
        urgency: "today" | "this_week" | "this_month";
        estimatedImpact: "high" | "medium" | "low";
        draftContent: string;
      }>;
      competitorStrategy: string;
      dealCoachingTip: string;
    };
  });
