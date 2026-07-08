import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const startGmailAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { origin: string }) =>
    z.object({ origin: z.string().url() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { buildAuthUrl, requireGoogleEnv } = await import("./gmail.server");
    requireGoogleEnv();
    // Sign state with user id — verified in callback via admin lookup.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const state = crypto.randomUUID();
    await supabaseAdmin.from("gmail_accounts").upsert(
      {
        user_id: context.userId,
        gmail_address: "pending",
        status: "disconnected",
        history_id: state, // temp: store state token here for verification
      },
      { onConflict: "user_id" },
    );
    return { url: buildAuthUrl({ origin: data.origin, state: `${context.userId}:${state}` }) };
  });

export const disconnectGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { deleteEmails: boolean }) =>
    z.object({ deleteEmails: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("gmail_accounts")
      .update({
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
        status: "disconnected",
      })
      .eq("user_id", context.userId);
    if (data.deleteEmails) {
      await supabaseAdmin.from("lead_emails").delete().eq("account_user_id", context.userId);
    }
    return { ok: true };
  });

export const getMyGmailAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("gmail_accounts")
      .select("gmail_address,status,last_synced_at,last_error")
      .eq("user_id", context.userId)
      .maybeSingle();
    return data;
  });
