import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Cron-callable endpoint. Runs daily.
// For each company with stale_alert_enabled=true:
//   - find strategic-tier accounts whose last visit is >= threshold days ago
//     and that have not been alerted in the last threshold days
//   - insert reminders for the assigned rep + weekly_report_recipients
//   - log to visit_alert_log
// On Monday, also enqueue a weekly summary reminder for recipients.

export const Route = createFileRoute("/api/public/hooks/visit-analytics-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET;
        const provided = request.headers.get("x-cron-secret");
        if (!cronSecret || provided !== cronSecret) {
          return new Response("Unauthorized", { status: 401 });
        }
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) return Response.json({ error: "Missing supabase env" }, { status: 500 });
        const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });


        const now = new Date();
        // Weekly summary fires on Saturday (business week starts Sat; Friday is the weekly holiday).
        const isWeeklySummaryDay = now.getUTCDay() === 6;
        const results: any[] = [];

        const { data: companies } = await sb.from("visit_analytics_settings")
          .select("company_id, stale_threshold_days, strategic_tiers, weekly_report_recipients, weekly_report_enabled, stale_alert_enabled");

        for (const cfg of companies ?? []) {
          let staleFired = 0;

          if (cfg.stale_alert_enabled) {
            const threshold = cfg.stale_threshold_days ?? 30;
            const cutoff = new Date(now.getTime() - threshold * 86400000);

            const { data: accounts } = await sb.from("customers")
              .select("id, customer_name, tier, assigned_rep_id")
              .eq("company_id", cfg.company_id)
              .in("tier", cfg.strategic_tiers ?? ["strategic"])
              .is("deleted_at", null);

            for (const a of accounts ?? []) {
              // last visit
              const [{ data: vc }, { data: cv }] = await Promise.all([
                sb.from("visit_checkins").select("checkin_time")
                  .eq("account_id", a.id).order("checkin_time", { ascending: false }).limit(1),
                sb.from("customer_visits").select("meeting_at")
                  .eq("account_id", a.id).order("meeting_at", { ascending: false }).limit(1),
              ]);
              const last1 = vc?.[0]?.checkin_time ? new Date(vc[0].checkin_time) : null;
              const last2 = cv?.[0]?.meeting_at ? new Date(cv[0].meeting_at) : null;
              const last = [last1, last2].filter(Boolean).sort((x: any, y: any) => y - x)[0] ?? null;
              if (last && last > cutoff) continue;

              // dedupe — skip if alerted within threshold
              const { data: prev } = await sb.from("visit_alert_log")
                .select("id").eq("company_id", cfg.company_id).eq("account_id", a.id)
                .eq("alert_type", "stale_strategic")
                .gte("fired_at", cutoff.toISOString()).limit(1);
              if (prev && prev.length > 0) continue;

              const days = last ? Math.floor((now.getTime() - last.getTime()) / 86400000) : null;
              const targets = new Set<string>();
              if (a.assigned_rep_id) targets.add(a.assigned_rep_id);
              (cfg.weekly_report_recipients ?? []).forEach((u: string) => targets.add(u));

              for (const uid of targets) {
                await sb.from("reminders").insert({
                  user_id: uid,
                  company_id: cfg.company_id,
                  title: `Strategic account overdue: ${a.customer_name}`,
                  body: `${a.tier} account not visited in ${days ?? "ever"} days.`,
                  remind_at: now.toISOString(),
                });
              }
              await sb.from("visit_alert_log").insert({
                company_id: cfg.company_id,
                account_id: a.id,
                alert_type: "stale_strategic",
                days_since_visit: days,
              });
              staleFired++;
            }
          }

          let weeklyFired = 0;
          if (isWeeklySummaryDay && cfg.weekly_report_enabled && (cfg.weekly_report_recipients ?? []).length > 0) {
            for (const uid of cfg.weekly_report_recipients) {
              await sb.from("reminders").insert({
                user_id: uid,
                company_id: cfg.company_id,
                title: "Weekly Visit Analytics summary",
                body: "Open the Visit Analytics tab and click 'Generate AI Insights' for this week's coverage summary.",
                remind_at: now.toISOString(),
              });
              weeklyFired++;
            }
          }

          results.push({ company_id: cfg.company_id, staleFired, weeklyFired });
        }

        return Response.json({ ok: true, ranAt: now.toISOString(), results });
      },
    },
  },
});
