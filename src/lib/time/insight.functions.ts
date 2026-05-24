import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  context: z.string().min(1).max(15000),
});

export const generateWeeklyInsight = createServerFn({ method: "POST" })
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
          { role: "system", content: "You are a revenue intelligence analyst. Produce a 4-5 paragraph insight report in clear markdown (use ** for emphasis)." },
          { role: "user", content: `Analyze this weekly time + pipeline data:\n\n${data.context}\n\nCover: (1) time allocation vs revenue potential mismatches, (2) clients deserving more attention, (3) productivity pattern observations, (4) ONE specific recommendation to improve billable ratio.` },
        ],
      }),
    });
    if (res.status === 429) throw new Error("AI rate limit reached.");
    if (res.status === 402) throw new Error("AI credits exhausted.");
    if (!res.ok) throw new Error(`AI service error (${res.status}).`);
    const payload = await res.json();
    const text = payload?.choices?.[0]?.message?.content as string | undefined;
    if (!text) throw new Error("AI returned empty response.");
    return { text };
  });
