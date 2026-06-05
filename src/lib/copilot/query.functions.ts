import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const HistoryTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8000),
});

const InputSchema = z.object({
  company_id: z.string().uuid(),
  question: z.string().min(1).max(2000),
  history: z.array(HistoryTurnSchema).max(8).default([]),
});

const tool = {
  type: "function" as const,
  function: {
    name: "submit_copilot_answer",
    description: "Return a structured answer for the manager copilot.",
    parameters: {
      type: "object",
      properties: {
        answer: { type: "string", description: "Markdown-formatted prose answer: direct answer, key insight, recommended action." },
        table: {
          type: "object",
          nullable: true,
          properties: {
            title: { type: "string" },
            columns: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  key: { type: "string" },
                  label: { type: "string" },
                  format: { type: "string", enum: ["bdt", "number", "percent", "text", "date"] },
                },
                required: ["key", "label"],
                additionalProperties: false,
              },
            },
            rows: { type: "array", items: { type: "object", additionalProperties: true } },
          },
          required: ["columns", "rows"],
          additionalProperties: false,
        },
        chart: {
          type: "object",
          nullable: true,
          properties: {
            type: { type: "string", enum: ["bar", "line", "pie"] },
            title: { type: "string" },
            x_key: { type: "string" },
            series: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  key: { type: "string" },
                  label: { type: "string" },
                  color: { type: "string" },
                },
                required: ["key", "label"],
                additionalProperties: false,
              },
            },
            data: { type: "array", items: { type: "object", additionalProperties: true } },
          },
          required: ["type", "x_key", "series", "data"],
          additionalProperties: false,
        },
        drill_downs: {
          type: "array",
          nullable: true,
          items: {
            type: "object",
            properties: { label: { type: "string" }, path: { type: "string" } },
            required: ["label", "path"],
            additionalProperties: false,
          },
        },
        citation: { type: "string", description: "E.g. 'Based on X visits, Y deals, updated Z minutes ago.'" },
      },
      required: ["answer", "citation"],
      additionalProperties: false,
    },
  },
};

export const copilotQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("AI service is not configured.");

    const { buildCopilotDataSnapshot } = await import("./dataContext.server");
    const snapshot = await buildCopilotDataSnapshot(context.supabase as any, data.company_id);

    const systemPrompt = `You are an intelligent sales management AI assistant for SmartData Limited, a B2B cybersecurity and ICT distributor in Bangladesh (OEMs: Fortinet, Rubrik, HivePro, Gambit Cyber, Gurucul, LinkShadow, Adaptiva, DEEPX, Gopher Security).

You have access to a JSON snapshot of the company's sales data. Answer the manager's question using ONLY the data provided. Be direct and concise.

CURRENCY: Always use BDT with the symbol ৳ and South-Asian lakh/crore notation (e.g. ৳25,00,000 = 25 lakh; ৳3,50,00,000 = 3.5 crore). Format numbers with comma grouping.

FORMAT your prose 'answer' as markdown with this structure:
1. **Direct answer** (1–2 sentences)
2. **Key insight** (1 sentence — what's the story behind the data)
3. **Recommended action** (1–2 sentences — concrete next step)

If a table or chart would help, include it via the structured arguments. Prefer charts for trends and distributions, tables for ranked lists. Do NOT duplicate table data in prose.

Citation: state how many records the answer is grounded in and when the snapshot was generated.

If the data doesn't contain enough information to answer confidently, say so and recommend what to track.

Always call submit_copilot_answer.`;

    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
    ];
    for (const turn of data.history.slice(-4)) {
      messages.push({ role: turn.role, content: turn.content });
    }
    messages.push({
      role: "user",
      content: `QUESTION: ${data.question}\n\nDATA SNAPSHOT (JSON):\n${JSON.stringify(snapshot)}`,
    });

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        tools: [tool],
        tool_choice: { type: "function", function: { name: "submit_copilot_answer" } },
      }),
    });

    if (res.status === 429) throw new Error("AI rate limit reached. Please try again shortly.");
    if (res.status === 402) throw new Error("AI usage limit reached. Add credits in Settings.");
    if (!res.ok) {
      const t = await res.text();
      console.error("copilot AI error", res.status, t);
      throw new Error(`AI service error (${res.status}).`);
    }

    const payload = await res.json();
    const argsStr = payload?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) throw new Error("AI did not return structured output.");
    const parsed = JSON.parse(argsStr);
    return {
      answer: parsed.answer as string,
      table: parsed.table ?? null,
      chart: parsed.chart ?? null,
      drill_downs: parsed.drill_downs ?? null,
      citation: (parsed.citation as string) ||
        `Based on ${snapshot.summary.total_leads} leads, ${snapshot.summary.visits_last_30d} visits in the last 30 days. Snapshot at ${new Date(snapshot.generated_at).toLocaleTimeString()}.`,
    };
  });
