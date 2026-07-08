import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Daily reminder cron for office-work logging.
 * Expected schedule: 18:00 Asia/Dhaka on working days (Sun–Thu).
 * Auth: x-cron-secret header must match CRON_SECRET.
 *
 * Inserts an in-app reminder for every profile that has neither a customer_visit
 * nor an office_work_log for today.
 */
export const Route = createFileRoute("/api/public/hooks/office-work-reminder")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-cron-secret");
        if (!secret || secret !== process.env.CRON_SECRET) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }

        // Compute today (Asia/Dhaka)
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
        }).formatToParts(new Date());
        const y = parts.find((p) => p.type === "year")!.value;
        const m = parts.find((p) => p.type === "month")!.value;
        const d = parts.find((p) => p.type === "day")!.value;
        const wd = parts.find((p) => p.type === "weekday")!.value;
        const today = `${y}-${m}-${d}`;
        // Skip Fri/Sat
        if (wd === "Fri" || wd === "Sat") {
          return new Response(JSON.stringify({ ok: true, skipped: "weekend" }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        const startIso = `${today}T00:00:00+06:00`;
        const endIso = `${today}T23:59:59+06:00`;

        const { data: members } = await supabaseAdmin
          .from("company_members").select("user_id, company_id");
        const { data: logs } = await supabaseAdmin
          .from("office_work_logs").select("user_id").eq("work_date", today);
        const { data: visits } = await supabaseAdmin
          .from("customer_visits").select("user_id")
          .gte("meeting_at", startIso).lte("meeting_at", endIso).neq("status", "office_study");

        const loggedUsers = new Set<string>();
        (logs ?? []).forEach((l: any) => loggedUsers.add(l.user_id));
        (visits ?? []).forEach((v: any) => loggedUsers.add(v.user_id));

        const now = new Date().toISOString();
        const inserts: any[] = [];
        const seen = new Set<string>();
        for (const mem of (members ?? []) as any[]) {
          const key = `${mem.user_id}:${mem.company_id}`;
          if (seen.has(key)) continue;
          if (loggedUsers.has(mem.user_id)) continue;
          seen.add(key);
          inserts.push({
            user_id: mem.user_id,
            company_id: mem.company_id,
            title: "Reminder: log your work for today",
            body: "You haven't logged office work or a visit for today. Take a minute to add it.",
            remind_at: now,
          });
        }

        let created = 0;
        if (inserts.length) {
          const { count, error } = await supabaseAdmin
            .from("reminders").insert(inserts, { count: "exact" });
          if (error) {
            return new Response(JSON.stringify({ ok: false, error: error.message }), {
              status: 500, headers: { "Content-Type": "application/json" },
            });
          }
          created = count ?? inserts.length;
        }

        return new Response(JSON.stringify({ ok: true, date: today, created }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
