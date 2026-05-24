import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  context: z.string().min(1).max(15000),
});

const tool = {
  type: "function" as const,
  function: {
    name: "return_daily_briefing",
    description: "Return today's 5-point executive briefing.",
    parameters: {
      type: "object",
      properties: {
        points: {
          type: "array",
          items: {
            type: "object",
            properties: {
              icon: { type: "string", description: "One of: focus, overdue, quick_win, risk, motivation" },
              title: { type: "string" },
              detail: { type: "string" },
            },
            required: ["icon", "title", "detail"],
            additionalProperties: false,
          },
        },
      },
      required: ["points"],
      additionalProperties: false,
    },
  },
};

export const generateBriefing = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI service is not configured.");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a sales executive coach. Always call return_daily_briefing with exactly 5 points in this order: focus, overdue, quick_win, risk, motivation." },
          { role: "user", content: `Generate a 5-point daily briefing for a BD professional based on this context:\n\n${data.context}\n\nBe specific (use deal/client names). Each detail 1-2 sentences.` },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "return_daily_briefing" } },
      }),
    });
    if (res.status === 429) throw new Error("AI rate limit reached.");
    if (res.status === 402) throw new Error("AI credits exhausted.");
    if (!res.ok) throw new Error(`AI service error (${res.status}).`);
    const payload = await res.json();
    const args = payload?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI did not return structured output.");
    return JSON.parse(args) as { points: { icon: string; title: string; detail: string }[] };
  });
