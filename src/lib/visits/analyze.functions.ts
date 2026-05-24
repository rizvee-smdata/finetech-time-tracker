import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  customerName: z.string().min(1).max(200),
  company: z.string().max(200).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  meetingAt: z.string().min(1).max(100),
  discussionSummary: z.string().min(1).max(20000),
  nextAction: z.string().max(2000).optional().nullable(),
  remarks: z.string().max(2000).optional().nullable(),
});

const tool = {
  type: "function" as const,
  function: {
    name: "return_processed_visit",
    description: "Return structured analysis of a customer visit.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "3-4 sentence executive summary of the visit" },
        sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
        painPoints: { type: "array", items: { type: "string" } },
        nextSteps: { type: "array", items: { type: "string" } },
        actionItems: {
          type: "array",
          items: {
            type: "object",
            properties: {
              task: { type: "string" },
              owner: { type: "string" },
              deadline: { type: "string" },
              priority: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["task", "owner", "deadline", "priority"],
            additionalProperties: false,
          },
        },
        followUpSubject: { type: "string" },
        followUpEmail: { type: "string" },
      },
      required: [
        "summary",
        "sentiment",
        "painPoints",
        "nextSteps",
        "actionItems",
        "followUpSubject",
        "followUpEmail",
      ],
      additionalProperties: false,
    },
  },
};

export type VisitAnalysis = {
  summary: string;
  sentiment: "positive" | "neutral" | "negative";
  painPoints: string[];
  nextSteps: string[];
  actionItems: { task: string; owner: string; deadline: string; priority: "high" | "medium" | "low" }[];
  followUpSubject: string;
  followUpEmail: string;
};

export const analyzeVisit = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<VisitAnalysis> => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) {
      throw new Error("AI service is not configured. Please contact support.");
    }

    const userPrompt = `You are an expert CRM assistant and field sales analyst.

Analyze this customer visit and call the return_processed_visit tool with structured output.

Visit Context:
- Customer: ${data.customerName}${data.company ? ` from ${data.company}` : ""}
- Location: ${data.location ?? "—"}
- When: ${data.meetingAt}
${data.nextAction ? `- Stated next action: ${data.nextAction}` : ""}
${data.remarks ? `- Remarks: ${data.remarks}` : ""}

Discussion notes:
${data.discussionSummary}

Rules:
- summary: 3-4 sentence executive summary highlighting outcomes and signals.
- sentiment: gauge overall buyer attitude from the notes.
- painPoints: explicit problems, frustrations, or unmet needs raised.
- nextSteps: concrete moves the rep should make next (specific, not generic).
- actionItems: every commitment/task with owner (person name or "Me"), realistic deadline, and priority.
- followUpEmail: complete professional follow-up email body addressed to ${data.customerName}, signed off generically (no fake names).
- Be specific. No placeholders.`;

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
              "You are an expert CRM and field sales analyst. Always respond by calling the return_processed_visit tool.",
          },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "return_processed_visit" } },
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
    const toolCall = payload?.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = toolCall?.function?.arguments;
    if (!argsStr) {
      console.error("No tool call in AI response", JSON.stringify(payload));
      throw new Error("AI did not return structured output. Please retry.");
    }

    try {
      return JSON.parse(argsStr) as VisitAnalysis;
    } catch {
      console.error("Failed to parse tool args", argsStr);
      throw new Error("AI returned invalid JSON. Please retry.");
    }
  });
