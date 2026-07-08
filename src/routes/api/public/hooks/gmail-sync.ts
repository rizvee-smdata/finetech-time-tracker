import { createFileRoute } from "@tanstack/react-router";

// Called by pg_cron every 30 min during working hours.
export const Route = createFileRoute("/api/public/hooks/gmail-sync")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runSync } = await import("@/lib/gmail/sync.server");

        const { data: accounts } = await supabaseAdmin
          .from("gmail_accounts")
          .select("user_id")
          .eq("status", "connected");

        const results: Array<{ user_id: string; new_emails: number; error?: string }> = [];
        for (const acc of accounts ?? []) {
          try {
            const r = await runSync({ userId: acc.user_id, scope: "scheduled" });
            results.push({ user_id: acc.user_id, new_emails: r.newEmails, error: r.error });
          } catch (e: any) {
            results.push({ user_id: acc.user_id, new_emails: 0, error: String(e?.message ?? e) });
          }
          // Sequential + delay to be gentle on Gmail
          await new Promise((r) => setTimeout(r, 250));
        }

        return Response.json({ processed: results.length, results });
      },
    },
  },
});
