import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  title: z.string().min(1).max(300),
  clientName: z.string().min(1).max(200),
  clientCompany: z.string().min(1).max(200),
  date: z.string().min(1).max(100),
  attendees: z.array(z.string().max(200)).max(50),
  rawNotes: z.string().min(1).max(20000),
  regenerateInstruction: z.string().max(2000).optional(),
});

const tool = {
  type: "function" as const,
  function: {
    name: "return_processed_meeting",
    description: "Return structured meeting analysis.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string" },
        sentimentScore: { type: "string", enum: ["positive", "neutral", "negative"] },
        dealStage: {
          type: "string",
          enum: ["Prospecting", "Discovery", "Proposal", "Negotiation", "Closed Won", "Closed Lost"],
        },
        painPoints: { type: "array", items: { type: "string" } },
        objections: { type: "array", items: { type: "string" } },
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
        crmUpdates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: { type: "string" },
              suggestedValue: { type: "string" },
            },
            required: ["field", "suggestedValue"],
            additionalProperties: false,
          },
        },
        followUpSubject: { type: "string" },
        followUpEmail: { type: "string" },
      },
      required: [
        "summary",
        "sentimentScore",
        "dealStage",
        "painPoints",
        "objections",
        "nextSteps",
        "actionItems",
        "crmUpdates",
        "followUpSubject",
        "followUpEmail",
      ],
      additionalProperties: false,
    },
  },
};

export const analyzeMeeting = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) {
      throw new Error("AI service is not configured. Please contact support.");
    }

    const userPrompt = `You are an expert CRM assistant and business development analyst.

Analyze these meeting notes and call the return_processed_meeting tool with structured output.

Meeting Context:
- Title: ${data.title}
- Client: ${data.clientName} from ${data.clientCompany}
- Date: ${data.date}
- Attendees: ${data.attendees.join(", ") || "—"}

Raw Notes:
${data.rawNotes}

${data.regenerateInstruction ? `Regeneration instruction: ${data.regenerateInstruction}` : ""}

Rules:
- summary: 3-4 sentence executive summary
- actionItems: extract every commitment, deadline, or task. Owner is a person name or "Me".
- crmUpdates: suggest CRM field updates (e.g. Deal Stage, Deal Value, Close Date, Next Step, Competitor).
- followUpEmail: complete professional follow-up email body addressed to ${data.clientName}, signed off generically (no fake names).
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
              "You are an expert CRM and sales analyst. Always respond by calling the return_processed_meeting tool.",
          },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "return_processed_meeting" } },
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

    let parsed;
    try {
      parsed = JSON.parse(argsStr);
    } catch (e) {
      console.error("Failed to parse tool args", argsStr);
      throw new Error("AI returned invalid JSON. Please retry.");
    }

    return parsed as {
      summary: string;
      sentimentScore: "positive" | "neutral" | "negative";
      dealStage: string;
      painPoints: string[];
      objections: string[];
      nextSteps: string[];
      actionItems: { task: string; owner: string; deadline: string; priority: "high" | "medium" | "low" }[];
      crmUpdates: { field: string; suggestedValue: string }[];
      followUpSubject: string;
      followUpEmail: string;
    };
  });
