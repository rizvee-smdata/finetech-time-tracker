import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Runs daily: generates renewal leads for AMC/subscription deals nearing renewal_date,
// and posts reminders for idle leads. Called by pg_cron.
export const Route = createFileRoute("/api/public/hooks/crm-renewals")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-cron-secret");
        if (!secret || secret !== process.env.CRON_SECRET) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const sb = supabaseAdmin as any;
        const [renewals, idle] = await Promise.all([
          sb.rpc("crm_generate_renewal_leads"),
          sb.rpc("crm_remind_idle_leads"),
        ]);

        return new Response(
          JSON.stringify({
            ok: true,
            renewals_error: renewals.error?.message ?? null,
            idle_error: idle.error?.message ?? null,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
