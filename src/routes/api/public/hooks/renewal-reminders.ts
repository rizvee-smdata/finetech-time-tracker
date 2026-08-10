import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Renewal-approaching reminders.
 * Runs daily via pg_cron; notifies the assigned account manager bi-weekly
 * (every 14 days) for any won recurring deal whose renewal_date falls
 * within the next 60 days. Creates an in-app reminder + a transactional email.
 */
export const Route = createFileRoute("/api/public/hooks/renewal-reminders")({
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
        const now = new Date();
        const todayISO = now.toISOString().slice(0, 10);
        const horizonISO = new Date(now.getTime() + 60 * 86400_000).toISOString().slice(0, 10);
        const cutoff = new Date(now.getTime() - 14 * 86400_000).toISOString();
        const origin = new URL(request.url).origin;

        const { data: leads, error } = await sb
          .from("crm_leads")
          .select("id, company_id, customer_name, company_name, renewal_date, expected_value, currency, assigned_to")
          .eq("stage", "won")
          .neq("renewal_kind", "one_time")
          .not("renewal_date", "is", null)
          .not("assigned_to", "is", null)
          .gte("renewal_date", todayISO)
          .lte("renewal_date", horizonISO);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        const repIds = Array.from(new Set((leads ?? []).map((l: any) => l.assigned_to)));
        const { data: profiles } = repIds.length
          ? await sb.from("profiles").select("id, full_name, email").in("id", repIds)
          : { data: [] };
        const profileById = new Map<string, any>((profiles ?? []).map((p: any) => [p.id, p]));

        let notified = 0;
        let skipped = 0;

        for (const l of (leads ?? []) as any[]) {
          // Bi-weekly throttle: skip if this lead was already notified in the last 14 days.
          const { data: recent } = await sb
            .from("reminders")
            .select("id")
            .eq("user_id", l.assigned_to)
            .contains("metadata", { kind: "renewal_due", lead_id: l.id })
            .gte("created_at", cutoff)
            .limit(1);
          if (recent?.length) {
            skipped++;
            continue;
          }

          const daysToRenewal = Math.max(
            0,
            Math.round((new Date(l.renewal_date).getTime() - now.getTime()) / 86400_000),
          );
          const label = l.company_name ? `${l.customer_name} (${l.company_name})` : l.customer_name;
          const value =
            l.expected_value != null ? `${l.currency ?? "USD"} ${Number(l.expected_value).toLocaleString()}` : null;

          await sb.from("reminders").insert({
            user_id: l.assigned_to,
            company_id: l.company_id,
            title: `Renewal in ${daysToRenewal} day${daysToRenewal === 1 ? "" : "s"} — ${l.customer_name}`,
            body: `${label} renews on ${l.renewal_date}${value ? ` · ${value}` : ""}. Confirm the renewal plan with the customer.`,
            remind_at: now.toISOString(),
            category: "lead",
            link_url: `/crm/${l.id}`,
            metadata: { kind: "renewal_due", lead_id: l.id, renewal_date: l.renewal_date, days_to_renewal: daysToRenewal },
          });

          const p = profileById.get(l.assigned_to);
          if (p?.email) {
            try {
              await fetch(`${origin}/lovable/email/transactional/send`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-internal-cron": process.env.CRON_SECRET ?? "",
                },
                body: JSON.stringify({
                  templateName: "renewal-reminder",
                  recipientEmail: p.email,
                  idempotencyKey: `renewal-${l.id}-${todayISO}`,
                  templateData: {
                    managerName: p.full_name ?? p.email,
                    customerName: l.customer_name,
                    companyName: l.company_name,
                    renewalDate: l.renewal_date,
                    daysToRenewal,
                    value,
                    leadUrl: `${origin}/crm/${l.id}`,
                  },
                }),
              });
            } catch {
              // in-app reminder still delivered
            }
          }

          notified++;
        }

        return new Response(JSON.stringify({ ok: true, scanned: leads?.length ?? 0, notified, skipped }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
