import { createFileRoute } from "@tanstack/react-router";

// Triggered by pg_cron daily — snapshots config + data to the `backups` bucket
// and prunes files older than 30 days. Uses CRON_SECRET to authenticate.
export const Route = createFileRoute("/api/public/hooks/daily-backup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-cron-secret");
        if (!secret || secret !== process.env.CRON_SECRET) {
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
