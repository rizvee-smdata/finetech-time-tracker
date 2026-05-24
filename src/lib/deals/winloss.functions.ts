import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const DealSummarySchema = z.object({
  title: z.string().max(300),
  clientCompany: z.string().max(200),
  industry: z.string().max(200),
  dealValue: z.number(),
  currency: z.string().max(10),
  stage: z.enum(["Closed Won", "Closed Lost"]),
  products: z.array(z.string().max(200)).max(20),
  competitors: z.array(z.string().max(200)).max(20),
  cycleDays: z.number(),
  lossReason: z.string().max(500).optional(),
});

const InputSchema = z.object({
  deals: z.array(DealSummarySchema).max(200),
});

export const generateWinLossReport = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("AI service is not configured.");

    const prompt = `You are a sales operations analyst for a Bangladesh ICT solutions company. Analyze the following closed deals and produce a Win/Loss Intelligence Report.

Closed deals (${data.deals.length}):
${data.deals
  .map(
    (d) =>
      `- [${d.stage}] ${d.clientCompany} (${d.industry}) — ${d.currency} ${d.dealValue.toLocaleString()} — products: ${d.products.join(", ")} — competitors: ${d.competitors.join(", ") || "none"} — cycle ${d.cycleDays}d${d.lossReason ? ` — loss reason: ${d.lossReason}` : ""}`,
  )
  .join("\n")}

Produce a clear markdown report with these sections (use ## headings):
## Patterns in Wins
## Patterns in Losses
## Recommended Focus Areas
## Competitor Win Rates
## Best Performing Deal Profile

Keep it specific, actionable, and grounded in the data above. No fluff.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a precise sales operations analyst." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (res.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
    if (res.status === 402)
      throw new Error("AI usage limit reached. Add credits in Settings → Workspace → Usage.");
    if (!res.ok) {
      const txt = await res.text();
      console.error("AI gateway error", res.status, txt);
      throw new Error(`AI service error (${res.status}).`);
    }

    const payload = await res.json();
    const content: string = payload?.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) throw new Error("AI returned an empty report. Please retry.");
    return { report: content };
  });
