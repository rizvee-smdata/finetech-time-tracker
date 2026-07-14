// Generate WhatsApp/email follow-up draft via Anthropic Claude.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireCronOrUser, unauthorized } from "../_shared/auth-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  rep_name: string;
  contact_name: string;
  company: string;
  days_since_contact: number;
  last_interaction_type?: string;
  deal_context?: string;
  channel?: "whatsapp" | "email";
  language?: "en" | "bn";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  }

  const guard = await requireCronOrUser(req);
  if (!guard.ok) return unauthorized(corsHeaders, guard.reason);


  try {
    const body = (await req.json()) as Body;
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const channel = body.channel ?? "whatsapp";
    const langNote = body.language === "bn" ? "Write in Bangla." : "Write in English.";

    const system = `You are a helpful B2B sales rep writing brief, professional follow-up messages from SmartData Limited (cybersecurity and ICT distributor in Bangladesh). Be friendly but not generic — avoid clichés like "Hope this finds you well". Output ONLY the message text (no labels, no quotes, no markdown fences). ${langNote}`;

    const ctx = body.deal_context ? `Context: ${body.deal_context}.` : "";
    let userPrompt: string;
    if (channel === "email") {
      userPrompt = `Write a short email follow-up.\nFrom: ${body.rep_name}\nTo: ${body.contact_name} at ${body.company}\nLast contact: ${body.days_since_contact} days ago via ${body.last_interaction_type ?? "previous discussion"}.\n${ctx}\nReturn JSON ONLY with keys: subject (short, specific), body (under 120 words, friendly, with a clear next step). No prose around the JSON.`;
    } else {
      userPrompt = `Write a brief WhatsApp follow-up message.\nFrom: ${body.rep_name}\nTo: ${body.contact_name} at ${body.company}\nLast contact: ${body.days_since_contact} days ago via ${body.last_interaction_type ?? "previous discussion"}.\n${ctx}\nKeep under 90 words. Friendly, professional, clear call-to-action. Output the message text only.`;
    }

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        system,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      return new Response(JSON.stringify({ error: `Claude API ${aiRes.status}: ${t.slice(0, 400)}` }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await aiRes.json();
    const text: string = data?.content?.[0]?.text ?? "";

    if (channel === "email") {
      let parsed: any = null;
      try { parsed = JSON.parse(text); }
      catch { const m = text.match(/\{[\s\S]*\}/); if (m) { try { parsed = JSON.parse(m[0]); } catch {} } }
      return new Response(JSON.stringify({
        channel,
        subject: parsed?.subject ?? `Following up — ${body.contact_name}`,
        message: parsed?.body ?? text.trim(),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ channel, message: text.trim() }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
