/**
 * Central licence verification endpoint (vendor side).
 *
 * Customer deployments call this on a schedule with the SHA-256 hash of their
 * licence key. It answers with the authoritative status held on the Lavisho
 * licence server, so a licence that is deactivated (suspended) or revoked here
 * stops working on the customer's instance — and a fabricated key never
 * validates at all.
 *
 * Public by design (no session): the key hash is the credential.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  key_hash: z.string().trim().regex(/^[a-f0-9]{64}$/i),
  organization_id: z.string().uuid().nullable().optional(),
  domain: z.string().trim().max(255).nullable().optional(),
  seats_used: z.number().int().min(0).max(1_000_000).nullable().optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/license/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed: z.infer<typeof Body>;
        try {
          parsed = Body.parse(await request.json());
        } catch {
          return json({ valid: false, status: "invalid_request" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: lic } = await (supabaseAdmin as any)
          .from("licenses")
          .select(
            "id, status, edition, max_users, starts_at, expires_at, grace_days, bind_domain, organization_id, customer_name, last_verified_at",
          )
          .eq("key_hash", parsed.key_hash)
          .maybeSingle();

        if (!lic) {
          return json({ valid: false, status: "unknown_key", message: "Licence key not recognised." });
        }

        const today = new Date().toISOString().slice(0, 10);
        const expired = !!lic.expires_at && lic.expires_at < today;
        const deactivated = lic.status === "suspended" || lic.status === "revoked";

        // Heartbeat bookkeeping — at most one logged event per licence per day.
        const lastSeen = lic.last_verified_at ? new Date(lic.last_verified_at).getTime() : 0;
        await (supabaseAdmin as any)
          .from("licenses")
          .update({ last_verified_at: new Date().toISOString() })
          .eq("id", lic.id);
        if (Date.now() - lastSeen > 86_400_000) {
          await (supabaseAdmin as any).from("license_events").insert({
            license_id: lic.id,
            event_type: "checked_in",
            details: {
              organization_id: parsed.organization_id ?? null,
              domain: parsed.domain ?? null,
              seats_used: parsed.seats_used ?? null,
            },
          });
        }

        return json({
          valid: !deactivated && !expired,
          status: lic.status,
          deactivated,
          edition: lic.edition,
          max_users: lic.max_users,
          starts_at: lic.starts_at,
          expires_at: lic.expires_at,
          grace_days: lic.grace_days,
          bind_domain: lic.bind_domain,
          customer_name: lic.customer_name,
          checked_at: new Date().toISOString(),
          message: deactivated
            ? lic.status === "revoked"
              ? "This licence has been revoked by Lavisho."
              : "This licence has been deactivated by Lavisho."
            : expired
              ? "This licence has expired."
              : null,
        });
      },
    },
  },
});
