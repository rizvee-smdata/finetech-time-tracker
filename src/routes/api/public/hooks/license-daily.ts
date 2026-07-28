import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendLicenseNotice } from "@/lib/licensing/licenses.server";

const REMINDER_DAYS = [30, 14, 7, 1, 0];
const INTERNAL_MAILBOX = "licensing@lavishott.cloud";

// Daily job: transition license statuses and send expiry reminders (de-duplicated).
export const Route = createFileRoute("/api/public/hooks/license-daily")({
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
        const transitions = await sb.rpc("license_daily_transition");

        const today = new Date().toISOString().slice(0, 10);
        const { data: licenses } = await sb
          .from("licenses")
          .select("id, customer_name, customer_email, edition, expires_at, grace_days, status, organization_id")
          .not("expires_at", "is", null)
          .in("status", ["active", "expired"]);

        let sent = 0;
        for (const l of (licenses ?? []) as any[]) {
          const days = Math.round(
            (new Date(l.expires_at + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime()) / 86400000,
          );
          const graceEnd = -(l.grace_days ?? 14) + 3;
          let kind: string | null = null;
          if (REMINDER_DAYS.includes(days)) kind = days === 0 ? "expired_today" : `d${days}`;
          else if (days === graceEnd) kind = "grace_ending";
          if (!kind) continue;

          const { data: already } = await sb
            .from("license_events")
            .select("id")
            .eq("license_id", l.id)
            .eq("event_type", "reminder_sent")
            .contains("details", { kind })
            .maybeSingle();
          if (already) continue;

          const recipients = new Set<string>([l.customer_email]);
          if (l.organization_id) {
            const { data: members } = await sb
              .from("company_members")
              .select("user_id")
              .eq("company_id", l.organization_id);
            const ids = (members ?? []).map((m: any) => m.user_id);
            if (ids.length) {
              const { data: admins } = await sb.from("user_roles").select("user_id").eq("role", "admin").in("user_id", ids);
              const adminIds = (admins ?? []).map((a: any) => a.user_id);
              if (adminIds.length) {
                const { data: profs } = await sb.from("profiles").select("email").in("id", adminIds);
                for (const p of profs ?? []) if (p.email) recipients.add(p.email);
              }
            }
          }
          recipients.add(INTERNAL_MAILBOX);

          const body =
            kind === "grace_ending"
              ? `Your Lavisho license grace period ends in 3 days. After that the app switches to read-only mode.\n\nEdition: ${l.edition}\nExpired: ${l.expires_at}\nRenew: sales@lavishott.cloud`
              : kind === "expired_today"
                ? `Your Lavisho license expired today (${l.expires_at}). You are now in a ${l.grace_days}-day grace period.\n\nRenew: sales@lavishott.cloud`
                : `Your Lavisho license expires in ${days} day(s) on ${l.expires_at}.\n\nEdition: ${l.edition}\nRenew: sales@lavishott.cloud`;

          for (const to of recipients) {
            await sendLicenseNotice({
              to,
              subject: "Lavisho license expiry reminder",
              title: "License expiry reminder",
              bodyText: body,
            });
          }
          await sb.from("license_events").insert({
            license_id: l.id,
            event_type: "reminder_sent",
            details: { kind, recipients: Array.from(recipients) },
          });
          sent++;
        }

        return new Response(
          JSON.stringify({ ok: true, transitions: transitions.data ?? 0, reminders_sent: sent }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
