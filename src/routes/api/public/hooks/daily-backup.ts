import { createFileRoute } from "@tanstack/react-router";

// Triggered by pg_cron daily — snapshots config + data to the `backups` bucket
// and prunes files older than 30 days. Uses CRON_SECRET to authenticate.
export const Route = createFileRoute("/api/public/hooks/daily-backup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Authenticated via the project's anon apikey header (per pg_cron convention)
        const apikey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!apikey || !expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const { runSnapshot } = await import("@/lib/safety.functions");
          const res = await runSnapshot();
          return new Response(JSON.stringify(res), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          return new Response(
            JSON.stringify({ ok: false, error: e?.message ?? String(e) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
