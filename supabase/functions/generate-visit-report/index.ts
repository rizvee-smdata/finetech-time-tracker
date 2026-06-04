// Generate structured AI visit reports using Anthropic Claude.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  raw_notes: string;
  client_name: string;
  rep_name: string;
  visit_date: string;
  tone?: "formal" | "concise" | "detailed";
  language?: "en" | "bn";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json()) as Body;
    const { raw_notes, client_name, rep_name, visit_date } = body;
    const tone = body.tone ?? "formal";
    const language = body.language ?? "en";

    if (!raw_notes || raw_notes.trim().length < 5) {
      return new Response(JSON.stringify({ error: "raw_notes is required (min 5 chars)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const system = `You are a professional sales report writer for a B2B technology company in Bangladesh. Generate structured visit reports from sales rep notes. Output ONLY valid JSON (no prose, no markdown fences) with keys: overview (string), discussion_points (array of strings), outcomes (string), products_discussed (array of strings), action_items (array of objects with task: string, assignee: string, due_days: number), next_visit_recommendation (string). Be professional and concise. Tone: ${tone}. ${language === "bn" ? "Output entirely in Bangla." : "If the input is in Bangla, output in Bangla; otherwise output in English."}`;

    const userPrompt = `Client: ${client_name}\nRep: ${rep_name}\nVisit date: ${visit_date}\nTone: ${tone}\nLanguage: ${language}\n\nRaw notes:\n${raw_notes}`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      return new Response(JSON.stringify({ error: `Claude API ${aiRes.status}: ${txt}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const text: string = data?.content?.[0]?.text ?? "";
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch {
          /* noop */
        }
      }
    }
    if (!parsed) {
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response as JSON", raw: text }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ report: parsed, model: "claude-sonnet-4-20250514" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
