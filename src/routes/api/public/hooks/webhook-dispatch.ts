import { createFileRoute } from "@tanstack/react-router";
import { signWebhookPayload } from "@/lib/api/keys.server";

const BACKOFF_MINUTES = [1, 5, 15, 60, 360];
const MAX_ATTEMPTS = 5;

/**
 * Delivers queued webhook events. Called by cron with the `x-cron-secret` header.
 */
export const Route = createFileRoute("/api/public/hooks/webhook-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-cron-secret");
        if (!secret || secret !== process.env["CRON_SECRET"]) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const sb = supabaseAdmin as any;

        const { data: pending, error } = await sb
          .from("webhook_deliveries")
          .select("id, endpoint_id, event, payload, attempts, webhook_endpoints(url, secret, is_active)")
          .eq("status", "pending")
          .lte("next_attempt_at", new Date().toISOString())
          .order("created_at", { ascending: true })
          .limit(50);

        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        let delivered = 0;
        let failed = 0;

        for (const row of pending ?? []) {
          const endpoint = row.webhook_endpoints;
          if (!endpoint || !endpoint.is_active) {
            await sb.from("webhook_deliveries").update({ status: "cancelled" }).eq("id", row.id);
            continue;
          }

          const attempts = (row.attempts ?? 0) + 1;
          const body = JSON.stringify({ event: row.event, data: row.payload, id: row.id });
          const timestamp = Math.floor(Date.now() / 1000).toString();
          let code = 0;
          let responseBody = "";

          try {
            const res = await fetch(endpoint.url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-webhook-event": row.event,
                "x-webhook-timestamp": timestamp,
                "x-webhook-signature": signWebhookPayload(endpoint.secret, timestamp, body),
              },
              body,
              signal: AbortSignal.timeout(10_000),
            });
            code = res.status;
            responseBody = (await res.text()).slice(0, 500);
          } catch (e) {
            responseBody = e instanceof Error ? e.message.slice(0, 500) : "request failed";
          }

          const ok = code >= 200 && code < 300;
          if (ok) {
            delivered++;
            await sb
              .from("webhook_deliveries")
              .update({
                status: "delivered",
                attempts,
                response_code: code,
                response_body: responseBody,
                delivered_at: new Date().toISOString(),
              })
              .eq("id", row.id);
            await sb
              .from("webhook_endpoints")
              .update({ failure_count: 0, last_success_at: new Date().toISOString() })
              .eq("id", row.endpoint_id);
          } else {
            failed++;
            const exhausted = attempts >= MAX_ATTEMPTS;
            const delay = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)]!;
            await sb
              .from("webhook_deliveries")
              .update({
                status: exhausted ? "failed" : "pending",
                attempts,
                response_code: code || null,
                response_body: responseBody,
                next_attempt_at: new Date(Date.now() + delay * 60_000).toISOString(),
              })
              .eq("id", row.id);
            await sb
              .from("webhook_endpoints")
              .update({ last_failure_at: new Date().toISOString() })
              .eq("id", row.endpoint_id);
          }
        }

        return new Response(JSON.stringify({ ok: true, processed: pending?.length ?? 0, delivered, failed }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
