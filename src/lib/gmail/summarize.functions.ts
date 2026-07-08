import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const summarizeLeadEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { leadId: string }) =>
    z.object({ leadId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("Anthropic API key not configured");

    const { data: emails } = await supabaseAdmin
      .from("lead_emails")
      .select("gmail_message_id,from_email,to_emails,subject,body_preview,snippet,sent_at,direction")
      .eq("lead_id", data.leadId)
      .order("sent_at", { ascending: false })
      .limit(20);
    if (!emails?.length) throw new Error("No emails yet.");

    const ids = emails.map((e: any) => e.gmail_message_id).sort();

    // Cache check
    const { data: cached } = await supabaseAdmin
      .from("lead_email_summaries")
      .select("*")
      .eq("lead_id", data.leadId)
      .maybeSingle();
    if (cached && JSON.stringify(cached.based_on_message_ids?.sort() ?? []) === JSON.stringify(ids)) {
      return cached;
    }

    const conversation = emails
      .slice()
      .reverse()
      .map(
        (e: any) =>
          `[${new Date(e.sent_at).toISOString()}] ${e.direction.toUpperCase()} from ${e.from_email} to ${(e.to_emails ?? []).join(", ")}\nSubject: ${e.subject ?? ""}\n${(e.body_preview ?? e.snippet ?? "").slice(0, 800)}`,
      )
      .join("\n\n---\n\n");

    const prompt = `You are a B2B sales analyst. Analyze this email thread and return strict JSON matching this shape:
{"summary_bullets": ["bullet1","bullet2","bullet3"], "ball_in_court": "one of: us|customer|third-party", "next_action": "one concrete next step in <=20 words"}

Thread:
${conversation}

Return ONLY the JSON. No prose.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-latest",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Claude API failed: ${await res.text()}`);
    const j = await res.json();
    const text: string = j.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI response not JSON");
    const parsed = JSON.parse(jsonMatch[0]) as {
      summary_bullets: string[];
      ball_in_court: string;
      next_action: string;
    };
    const row = {
      lead_id: data.leadId,
      summary_bullets: parsed.summary_bullets ?? [],
      ball_in_court: parsed.ball_in_court ?? "",
      next_action: parsed.next_action ?? "",
      based_on_message_ids: ids,
      generated_at: new Date().toISOString(),
    };
    await supabaseAdmin.from("lead_email_summaries").upsert(row, { onConflict: "lead_id" });
    return row;
  });
