import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";
import { generateText } from "ai";
import { z } from "zod";

function model() {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
  return createLovableAiGatewayProvider(apiKey)("google/gemini-2.5-flash");
}

async function buildLeadContext(supabase: any, leadId: string) {
  const { data: lead, error } = await supabase
    .from("crm_leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw error;
  if (!lead) throw new Error("Lead not found");

  const [{ data: acts }, { data: quotes }, { data: calls }] = await Promise.all([
    supabase.from("crm_lead_activities").select("activity_type, title, body, occurred_at")
      .eq("lead_id", leadId).order("occurred_at", { ascending: false }).limit(20),
    supabase.from("crm_quotes").select("title, amount, currency, status, version, valid_until, created_at")
      .eq("lead_id", leadId).order("version", { ascending: false }).limit(10),
    supabase.from("crm_call_logs").select("channel, outcome, duration_minutes, notes, called_at")
      .eq("lead_id", leadId).order("called_at", { ascending: false }).limit(10),
  ]);

  return {
    lead: {
      customer_name: lead.customer_name,
      company_name: lead.company_name,
      stage: lead.stage,
      priority: lead.priority,
      probability: lead.probability,
      expected_value: lead.expected_value,
      currency: lead.currency,
      expected_close_date: lead.expected_close_date,
      contact_person: lead.contact_person,
      designation: lead.designation,
      email: lead.email,
      phone: lead.phone,
      location: lead.location,
      source: lead.source,
      notes: lead.notes,
      competitor_name: lead.competitor_name,
      competitor_price: lead.competitor_price,
      competitor_notes: lead.competitor_notes,
      last_activity_at: lead.last_activity_at,
      stage_changed_at: lead.stage_changed_at,
      created_at: lead.created_at,
    },
    activities: acts ?? [],
    quotes: quotes ?? [],
    calls: calls ?? [],
  };
}

export const leadInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await buildLeadContext(context.supabase, data.leadId);
    const m = model();
    const result = await generateText({
      model: m,
      system: `You are a senior B2B sales coach. Read the provided lead JSON and produce a tight briefing in markdown with these sections:
1. **Snapshot** – 2 bullets summarizing where the deal stands.
2. **Risks** – up to 3 bullets (idle time, competitor, missing info, weak engagement).
3. **Next best actions** – up to 4 numbered actions, each starting with a verb and including a concrete artifact (call, email, demo, discount approval, etc.).
4. **Win probability** – your estimate as a single percentage with one-sentence rationale.
Be specific, reference data points. No fluff, no headings other than the four above.`,
      messages: [{ role: "user", content: "Lead data:\n```json\n" + JSON.stringify(ctx, null, 2) + "\n```" }],
    });
    return { text: result.text };
  });

export const draftFollowup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      leadId: z.string().uuid(),
      channel: z.enum(["email", "whatsapp"]),
      tone: z.enum(["friendly", "formal", "urgent"]).default("friendly"),
      goal: z.string().min(1).max(500),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await buildLeadContext(context.supabase, data.leadId);
    const m = model();
    const sys = data.channel === "email"
      ? `You draft B2B sales follow-up emails. Output ONLY the email: a subject line on the first line prefixed "Subject: ", then a blank line, then the body. Body 90–160 words, ${data.tone} tone, 1 clear ask. No placeholders like [Name] — use the contact's actual name.`
      : `You draft B2B WhatsApp follow-up messages. Output ONLY the message, 40–80 words, ${data.tone} tone, 1 clear ask, no greetings longer than one sentence, no placeholders.`;
    const result = await generateText({
      model: m,
      system: sys,
      messages: [{
        role: "user",
        content: `Goal: ${data.goal}\n\nLead context:\n\`\`\`json\n${JSON.stringify(ctx, null, 2)}\n\`\`\``,
      }],
    });
    return { text: result.text };
  });

export const winLossAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      companyId: z.string().uuid(),
      windowDays: z.number().int().min(7).max(720).default(180),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sinceIso = new Date(Date.now() - data.windowDays * 86400_000).toISOString();
    const { data: leads, error } = await context.supabase
      .from("crm_leads")
      .select("id, customer_name, company_name, stage, expected_value, currency, lost_reason, competitor_name, competitor_price, notes, won_at, lost_at, created_at")
      .eq("company_id", data.companyId)
      .in("stage", ["won", "lost"])
      .or(`won_at.gte.${sinceIso},lost_at.gte.${sinceIso}`)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    const sample = (leads ?? []).map((l: any) => ({
      outcome: l.stage,
      value: l.expected_value,
      currency: l.currency,
      lost_reason: l.lost_reason,
      competitor: l.competitor_name,
      competitor_price: l.competitor_price,
      notes: l.notes?.slice(0, 400) ?? null,
      cycle_days: l.won_at || l.lost_at
        ? Math.round((new Date(l.won_at || l.lost_at).getTime() - new Date(l.created_at).getTime()) / 86400_000)
        : null,
    }));
    if (sample.length === 0) return { text: "_No closed deals in the selected window. Close some leads to unlock insights._", count: 0 };
    const m = model();
    const result = await generateText({
      model: m,
      system: `You are a senior sales operations analyst. Given a JSON array of closed deals (won + lost), produce a tight markdown report with these sections only:
1. **Headline** – one sentence diagnosis.
2. **Why we win** – up to 4 bullets with patterns from won deals (cite counts/values).
3. **Why we lose** – up to 4 bullets with patterns from lost deals (group similar lost_reasons, name top competitors).
4. **Cycle insight** – compare avg cycle of won vs lost in days.
5. **Three actions for next quarter** – numbered, each <= 18 words, prescriptive.
Be quantitative. No filler.`,
      messages: [{ role: "user", content: "Closed deals:\n```json\n" + JSON.stringify(sample, null, 2) + "\n```" }],
    });
    return { text: result.text, count: sample.length };
  });

