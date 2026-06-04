// AI-powered KB Q&A — retrieves relevant articles and asks Claude.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json(401, { error: "Missing Authorization" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) return json(500, { error: "ANTHROPIC_API_KEY not configured" });

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) return json(401, { error: "Invalid session" });
    const userId = userRes.user.id;

    const body = (await req.json().catch(() => ({}))) as { question?: string };
    const question = (body.question ?? "").trim();
    if (!question || question.length > 2000) return json(400, { error: "Invalid question" });

    const admin = createClient(supabaseUrl, serviceKey);

    // Retrieve top 5 most relevant articles
    const { data: hits } = await admin.rpc("kb_search", { _q: question, _limit: 5 });
    const ids = (hits ?? []).map((h: { id: string }) => h.id);
    let articles: Array<{ id: string; title: string; oem_name: string | null; content_text: string; article_type: string }> = [];
    if (ids.length) {
      const { data: rows } = await admin
        .from("kb_articles")
        .select("id, title, article_type, content_text, kb_oems(name)")
        .in("id", ids);
      articles = (rows ?? []).map((r: any) => ({
        id: r.id,
        title: r.title,
        article_type: r.article_type,
        content_text: r.content_text ?? "",
        oem_name: r.kb_oems?.name ?? null,
      }));
    }

    const context = articles.length
      ? articles
          .map(
            (a, i) =>
              `[Article ${i + 1}] ID: ${a.id}\nOEM: ${a.oem_name ?? "—"}\nType: ${a.article_type}\nTitle: ${a.title}\n\n${a.content_text.slice(0, 4000)}`,
          )
          .join("\n\n---\n\n")
      : "(No matching articles found in the knowledge base.)";

    const systemPrompt =
      "You are a knowledgeable sales assistant for SmartData Limited, a cybersecurity and ICT distributor in Bangladesh. Their OEM partners include Fortinet, Rubrik, HivePro, Gambit Cyber, Gurucul, LinkShadow, Adaptiva, DEEPX, and Gopher Security. Answer questions about our products using only the provided knowledge base articles. Be concise and specific. If the answer is not in the provided context, say so clearly and suggest what to ask the partner directly.";

    const userPrompt = `Question: ${question}\n\nKnowledge base context:\n\n${context}`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      return json(502, { error: `Claude ${aiRes.status}: ${txt.slice(0, 500)}` });
    }
    const aiData = await aiRes.json();
    const answer: string = aiData?.content?.[0]?.text ?? "";

    const sources = articles.map((a) => ({ id: a.id, title: a.title, oem_name: a.oem_name }));

    await admin.from("kb_ask_log").insert({
      user_id: userId,
      question,
      answer,
      source_article_ids: sources.map((s) => s.id),
    });

    return json(200, { answer, sources });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});
