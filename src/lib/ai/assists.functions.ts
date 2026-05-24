import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function callJSON(systemPrompt: string, userPrompt: string, tool: unknown): Promise<unknown> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("AI service is not configured.");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: (tool as { function: { name: string } }).function.name } },
    }),
  });
  if (res.status === 429) throw new Error("AI rate limited — try again in a moment.");
  if (res.status === 402) throw new Error("AI credits exhausted.");
  if (!res.ok) throw new Error(`AI error (${res.status})`);
  const payload = await res.json();
  const args = payload?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI returned no structured output");
  return JSON.parse(args);
}

// ─── COACH ME (deals/$dealId) ────────────────────────────────────────────────
export const coachDeal = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        dealContext: z.string().min(1).max(8000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    return (await callJSON(
      "You are an elite B2B sales coach for the Bangladesh enterprise market. Give terse, specific, actionable coaching.",
      `Deal context:\n${data.dealContext}\n\nCoach me on this deal.`,
      {
        type: "function",
        function: {
          name: "coach_deal",
          description: "Return 3-bullet deal coaching.",
          parameters: {
            type: "object",
            properties: {
              risks: { type: "array", items: { type: "string" }, description: "Top 2 risks, one sentence each." },
              whatToSay: { type: "string", description: "A specific phrase or question to use in the next conversation." },
              when: { type: "string", description: "When to take the next action (e.g. 'within 48h')." },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["risks", "whatToSay", "when", "confidence"],
            additionalProperties: false,
          },
        },
      },
    )) as { risks: string[]; whatToSay: string; when: string; confidence: "high" | "medium" | "low" };
  });

// ─── PLAN MY DAY (tasks) ─────────────────────────────────────────────────────
export const planMyDay = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ workspaceContext: z.string().min(1).max(10000) }).parse(input),
  )
  .handler(async ({ data }) => {
    return (await callJSON(
      "You are a productivity coach for a busy BD professional. Plan an effective workday.",
      `Workspace snapshot:\n${data.workspaceContext}\n\nPlan my day in 5-7 prioritized blocks.`,
      {
        type: "function",
        function: {
          name: "plan_my_day",
          parameters: {
            type: "object",
            properties: {
              blocks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    time: { type: "string", description: "Suggested time window, e.g. '9:00 – 9:45'" },
                    task: { type: "string" },
                    why: { type: "string" },
                    impact: { type: "string", enum: ["high", "medium", "low"] },
                  },
                  required: ["time", "task", "why", "impact"],
                  additionalProperties: false,
                },
              },
              summary: { type: "string" },
            },
            required: ["blocks", "summary"],
            additionalProperties: false,
          },
        },
      },
    )) as {
      blocks: { time: string; task: string; why: string; impact: "high" | "medium" | "low" }[];
      summary: string;
    };
  });

// ─── SUGGEST NEXT STEP (CRM lead) ────────────────────────────────────────────
export const suggestNextStep = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ leadContext: z.string().min(1).max(4000) }).parse(input),
  )
  .handler(async ({ data }) => {
    return (await callJSON(
      "You are a sales SDR coach. Suggest the single best next step for this lead.",
      `Lead:\n${data.leadContext}`,
      {
        type: "function",
        function: {
          name: "suggest_next_step",
          parameters: {
            type: "object",
            properties: {
              nextStep: { type: "string", description: "One concrete sentence." },
              channel: { type: "string", enum: ["call", "email", "whatsapp", "meeting", "linkedin"] },
              urgency: { type: "string", enum: ["today", "this_week", "later"] },
            },
            required: ["nextStep", "channel", "urgency"],
            additionalProperties: false,
          },
        },
      },
    )) as { nextStep: string; channel: string; urgency: string };
  });

// ─── SUMMARIZE NOTES (visits) ────────────────────────────────────────────────
export const summarizeNotes = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ raw: z.string().min(10).max(8000) }).parse(input),
  )
  .handler(async ({ data }) => {
    return (await callJSON(
      "You clean up rough field visit notes into clear structured summaries. Be concise.",
      `Raw notes:\n${data.raw}`,
      {
        type: "function",
        function: {
          name: "summarize_notes",
          parameters: {
            type: "object",
            properties: {
              summary: { type: "string", description: "2-3 sentence cleaned summary." },
              keyPoints: { type: "array", items: { type: "string" } },
              actionItems: { type: "array", items: { type: "string" } },
              sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
              tags: { type: "array", items: { type: "string" } },
            },
            required: ["summary", "keyPoints", "actionItems", "sentiment", "tags"],
            additionalProperties: false,
          },
        },
      },
    )) as {
      summary: string;
      keyPoints: string[];
      actionItems: string[];
      sentiment: "positive" | "neutral" | "negative";
      tags: string[];
    };
  });
