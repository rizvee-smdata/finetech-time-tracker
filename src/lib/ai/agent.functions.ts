import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Msg = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(8000),
});

const Input = z.object({
  messages: z.array(Msg).min(1).max(40),
  routeContext: z.object({
    route: z.string().max(200),
    summary: z.string().max(2000),
    entities: z
      .array(z.object({ type: z.string(), id: z.string(), label: z.string() }))
      .max(50),
  }),
  dataSnapshot: z.string().max(20000).optional(),
});

const actionTool = {
  type: "function" as const,
  function: {
    name: "respond_with_actions",
    description: "Reply to the user with a markdown message and an optional list of actions to apply to their DeskIQ workspace.",
    parameters: {
      type: "object",
      properties: {
        reply: { type: "string", description: "Markdown reply to display in chat." },
        actions: {
          type: "array",
          description: "Optional structured actions the app will auto-apply.",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: [
                  "update_deal_stage",
                  "add_deal_interaction",
                  "create_next_best_action",
                  "draft_email",
                  "open_route",
                ],
              },
              dealId: { type: "string" },
              stage: { type: "string", description: "New deal stage if type=update_deal_stage" },
              note: { type: "string", description: "Interaction note or NBA description" },
              interactionType: { type: "string", enum: ["meeting", "email", "call", "demo", "proposal_sent", "follow_up"] },
              sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
              priority: { type: "number", description: "1=high, 2=med, 3=low for NBA" },
              urgency: { type: "string", enum: ["today", "this_week", "this_month"] },
              actionType: { type: "string", enum: ["call", "email", "meeting", "proposal", "escalate", "demo"] },
              subject: { type: "string" },
              body: { type: "string" },
              description: { type: "string" },
              category: { type: "string" },
              route: { type: "string", description: "Path to navigate to if type=open_route" },
              label: { type: "string", description: "Short human label for this action shown in chat" },
            },
            required: ["type", "label"],
            additionalProperties: false,
          },
        },
      },
      required: ["reply"],
      additionalProperties: false,
    },
  },
};

const SYSTEM = `You are DeskIQ Copilot — an embedded AI agent for a Bangladeshi B2B sales/BD professional using DeskIQ.
You can answer questions AND take actions on the user's workspace via the respond_with_actions tool.

Your data sources (provided each turn):
- routeContext.summary tells you what page the user is on
- routeContext.entities lists the specific records visible (deals, leads, meetings, etc.)
- dataSnapshot is a compact JSON of relevant workspace records

When the user asks you to do something, prefer concrete actions over advice.
Always also write a short markdown reply explaining what you did or proposed.
Be terse. Use bullet lists. Use BDT (৳) when discussing money.
Never invent dealIds — only use IDs present in routeContext.entities or dataSnapshot.
For destructive operations (delete, bulk updates >5), refuse and ask the user to do it manually.`;

export const runAgent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI service is not configured.");

    const userContext = `# Page context
Route: ${data.routeContext.route}
${data.routeContext.summary}

Visible records:
${data.routeContext.entities.map((e) => `- [${e.type}] ${e.id} — ${e.label}`).join("\n") || "(none)"}

${data.dataSnapshot ? `# Workspace snapshot\n${data.dataSnapshot}` : ""}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "system", content: userContext },
          ...data.messages,
        ],
        tools: [actionTool],
        tool_choice: { type: "function", function: { name: "respond_with_actions" } },
      }),
    });
    if (res.status === 429) throw new Error("AI is rate-limited — try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Workspace → Usage.");
    if (!res.ok) throw new Error(`AI service error (${res.status}).`);

    const payload = await res.json();
    const args = payload?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return { reply: "Sorry, I couldn't form a response.", actionsJson: "[]" };
    try {
      const parsed = JSON.parse(args) as { reply: string; actions?: unknown[] };
      return { reply: parsed.reply, actionsJson: JSON.stringify(parsed.actions ?? []) };
    } catch {
      return { reply: "Sorry, my response was malformed.", actionsJson: "[]" };
    }
  });
