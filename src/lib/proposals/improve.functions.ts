import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  sectionTitle: z.string().min(1).max(300),
  currentContent: z.string().min(1).max(20000),
  instruction: z.string().min(1).max(1000),
  clientCompany: z.string().max(200),
  clientIndustry: z.string().max(200),
  tone: z.string().max(40),
});

const tool = {
  type: "function" as const,
  function: {
    name: "return_section_rewrite",
    description: "Return the rewritten HTML for a single proposal section.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" },
        changeNote: { type: "string" },
      },
      required: ["title", "content", "changeNote"],
      additionalProperties: false,
    },
  },
};

export const improveSection = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("AI service is not configured. Please contact support.");

    const userPrompt = `You are improving one section of a SmartData Limited proposal for ${data.clientCompany} (${data.clientIndustry}). Tone: ${data.tone}.

Section: ${data.sectionTitle}
Instruction from the writer: ${data.instruction}

Current HTML content:
${data.currentContent}

Rewrite the section per the instruction. Keep the same section type/intent. Return HTML using <h3>, <p>, <ul>, <li>, <strong>, <table>. Be specific to the client. No placeholders.

Call return_section_rewrite with the new title (may be unchanged), the rewritten HTML content, and a 1-sentence changeNote describing what changed.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are an expert proposal editor. Always respond by calling return_section_rewrite." },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "return_section_rewrite" } },
      }),
    });

    if (res.status === 429) throw new Error("AI rate limit reached. Please wait a minute and try again.");
    if (res.status === 402) throw new Error("AI usage limit reached. Please add credits.");
    if (!res.ok) {
      const txt = await res.text();
      console.error("AI gateway error", res.status, txt);
      throw new Error(`AI service error (${res.status}). Please try again.`);
    }

    const payload = await res.json();
    const argsStr = payload?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) throw new Error("AI did not return structured output.");
    return JSON.parse(argsStr) as { title: string; content: string; changeNote: string };
  });
