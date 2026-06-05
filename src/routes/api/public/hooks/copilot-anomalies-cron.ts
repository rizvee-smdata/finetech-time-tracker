import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/copilot-anomalies-cron")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        if (!apiKey || apiKey !== process.env.SUPABASE_ANON_KEY) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { detectAnomaliesForCompany, persistAnomalies } = await import("@/lib/copilot/anomalyDetect.server");

        const { data: companies, error } = await supabaseAdmin.from("companies").select("id, name");
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
        }

        let totalCreated = 0;
        const perCompany: Array<{ company: string; created: number; detected: number }> = [];
        for (const c of (companies ?? []) as Array<{ id: string; name: string }>) {
          try {
            const anomalies = await detectAnomaliesForCompany(supabaseAdmin as any, c.id);
            const created = await persistAnomalies(supabaseAdmin as any, anomalies);
            perCompany.push({ company: c.name, detected: anomalies.length, created });
            totalCreated += created;
          } catch (e) {
            console.error("anomaly detect failed for", c.id, e);
          }
        }

        return new Response(JSON.stringify({ ok: true, total_created: totalCreated, perCompany }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
