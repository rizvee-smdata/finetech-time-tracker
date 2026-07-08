import { createFileRoute } from "@tanstack/react-router";

function errPage(msg: string) {
  const safe = msg.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] as string);
  return new Response(
    `<!doctype html><html><body style="font-family:system-ui;max-width:640px;margin:60px auto;padding:24px;">
      <h1 style="font-size:20px">Gmail connection failed</h1>
      <p>${safe}</p>
      <p><a href="/settings/integrations">Back to Integrations</a></p>
    </body></html>`,
    { status: 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/gmail/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errParam = url.searchParams.get("error");
        if (errParam) return errPage(`Google returned: ${errParam}`);
        if (!code || !state || !state.includes(":")) return errPage("Missing code/state.");
        const [userId, token] = state.split(":", 2);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: pending } = await supabaseAdmin
          .from("gmail_accounts")
          .select("history_id")
          .eq("user_id", userId)
          .maybeSingle();
        if (!pending || pending.history_id !== token) return errPage("Invalid state token.");

        const { exchangeCodeForTokens, getGmailProfile, requireGoogleEnv } = await import(
          "@/lib/gmail/gmail.server"
        );
        try {
          const { workspaceDomain } = requireGoogleEnv();
          const origin = `${url.protocol}//${url.host}`;
          const tokens = await exchangeCodeForTokens(code, origin);
          const profile = await getGmailProfile(tokens.access_token);
          const addr = profile.emailAddress.toLowerCase();
          if (!addr.endsWith(`@${workspaceDomain.toLowerCase()}`)) {
            return errPage(
              `Only @${workspaceDomain} accounts can connect. You tried to connect ${addr}.`,
            );
          }
          if (!tokens.refresh_token) {
            return errPage(
              "Google didn't return a refresh token. Please revoke access at https://myaccount.google.com/permissions and try again.",
            );
          }
          const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
          await supabaseAdmin.from("gmail_accounts").upsert(
            {
              user_id: userId,
              gmail_address: addr,
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token,
              token_expires_at: expiry,
              status: "connected",
              last_error: null,
              history_id: null,
            },
            { onConflict: "user_id" },
          );
          return new Response(null, {
            status: 302,
            headers: { location: "/settings/integrations?connected=1" },
          });
        } catch (e: any) {
          return errPage(String(e?.message ?? e));
        }
      },
    },
  },
});
