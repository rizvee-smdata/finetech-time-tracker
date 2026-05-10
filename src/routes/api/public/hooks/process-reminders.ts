import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Generates reminders for upcoming meetings (next 24h) that don't have one yet.
// Called by pg_cron hourly.
export const Route = createFileRoute("/api/public/hooks/process-reminders")({
  server: {
    handlers: {
      POST: async () => {
        const now = new Date();
        const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        const { data: visits, error } = await supabaseAdmin
          .from("customer_visits")
          .select("id, user_id, customer_name, company, next_meeting_at, next_action")
          .gte("next_meeting_at", now.toISOString())
          .lte("next_meeting_at", horizon.toISOString());

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        let created = 0;
        for (const v of visits ?? []) {
          // skip if reminder already exists for this visit
          const { data: existing } = await supabaseAdmin
            .from("reminders").select("id").eq("visit_id", v.id).maybeSingle();
          if (existing) continue;

          await supabaseAdmin.from("reminders").insert({
            user_id: v.user_id,
            visit_id: v.id,
            title: `Upcoming meeting: ${v.customer_name}${v.company ? ` (${v.company})` : ""}`,
            body: v.next_action ?? null,
            remind_at: v.next_meeting_at!,
          });
          created++;
        }

        return new Response(
          JSON.stringify({ ok: true, scanned: visits?.length ?? 0, created }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
