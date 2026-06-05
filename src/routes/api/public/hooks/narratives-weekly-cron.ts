import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/narratives-weekly-cron")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        if (!apiKey || apiKey !== process.env.SUPABASE_ANON_KEY) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runWeeklyForCompany } = await import("@/lib/narratives/generate.server");
        const { previousWeekRange } = await import("@/lib/narratives/utils");

        const { start, end } = previousWeekRange();
        const { data: companies, error } = await supabaseAdmin
          .from("companies").select("id, name");
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
        }
        const per: Array<Record<string, unknown>> = [];
        let total = 0;
        for (const c of (companies ?? []) as Array<{ id: string; name: string }>) {
          try {
            const r = await runWeeklyForCompany(supabaseAdmin as any, c.id, start, end);
            per.push({ company: c.name, ...r });
            total += r.created;
          } catch (e) {
            per.push({ company: c.name, error: (e as Error).message });
          }
        }
        return new Response(JSON.stringify({ ok: true, week_start: start, week_end: end, total_created: total, per }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
