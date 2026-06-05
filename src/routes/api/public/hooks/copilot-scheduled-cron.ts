import { createFileRoute } from "@tanstack/react-router";

// Hourly cron: runs due scheduled reports. For each active report whose next_run_at is in the past
// (or null), execute the copilot query and record the result + reschedule.
export const Route = createFileRoute("/api/public/hooks/copilot-scheduled-cron")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        if (!apiKey || apiKey !== process.env.SUPABASE_ANON_KEY) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
        }

        const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
        if (!LOVABLE_API_KEY) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { buildCopilotDataSnapshot } = await import("@/lib/copilot/dataContext.server");

        const nowIso = new Date().toISOString();
        const { data: due } = await supabaseAdmin
          .from("copilot_scheduled_reports")
          .select("*")
          .eq("active", true)
          .or(`next_run_at.is.null,next_run_at.lte.${nowIso}`)
          .limit(50);

        type Row = {
          id: string; company_id: string; user_id: string;
          question: string; frequency: "daily" | "weekly" | "monthly"; delivery_method: string;
        };

        let processed = 0;
        for (const r of (due ?? []) as Row[]) {
          try {
            const snapshot = await buildCopilotDataSnapshot(supabaseAdmin as any, r.company_id);
            const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  { role: "system", content: "You are a B2B sales reporting AI. Reply in markdown with currency ৳ and lakh/crore notation. Keep under 400 words." },
                  { role: "user", content: `QUESTION: ${r.question}\n\nDATA:\n${JSON.stringify(snapshot.summary)}` },
                ],
              }),
            });
            if (!res.ok) throw new Error(`AI ${res.status}`);
            const payload = await res.json();
            const text: string = payload?.choices?.[0]?.message?.content ?? "(no answer)";

            const next = new Date();
            if (r.frequency === "daily") next.setDate(next.getDate() + 1);
            else if (r.frequency === "weekly") next.setDate(next.getDate() + 7);
            else next.setMonth(next.getMonth() + 1);

            await supabaseAdmin
              .from("copilot_scheduled_reports")
              .update({
                last_run_at: new Date().toISOString(),
                last_result: { answer: text, citation: `Auto-run ${r.frequency} report.` },
                next_run_at: next.toISOString(),
              })
              .eq("id", r.id);

            // In-app delivery: insert a reminder so the user sees it
            await supabaseAdmin.from("reminders").insert({
              user_id: r.user_id,
              company_id: r.company_id,
              title: `Scheduled report: ${r.question.slice(0, 60)}`,
              body: text.slice(0, 400),
              remind_at: new Date().toISOString(),
            });

            processed += 1;
          } catch (e) {
            console.error("scheduled report failed", r.id, e);
          }
        }
        return new Response(JSON.stringify({ ok: true, processed }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
