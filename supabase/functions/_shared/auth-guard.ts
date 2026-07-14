// Shared auth guard for edge functions.
// Accepts either a valid CRON_SECRET header (for scheduled/internal callers)
// or a valid Supabase user JWT (Authorization: Bearer <token>) for
// user-initiated calls from the app.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export interface GuardResult {
  ok: boolean;
  reason?: string;
  userId?: string;
  viaCron?: boolean;
}

export async function requireCronOrUser(req: Request): Promise<GuardResult> {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");
  if (cronSecret && provided && provided === cronSecret) {
    return { ok: true, viaCron: true };
  }

  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, reason: "Missing bearer token or x-cron-secret" };
  }
  const url = Deno.env.get("SUPABASE_URL");
  const anon =
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !anon) return { ok: false, reason: "Supabase env not configured" };

  const client = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return { ok: false, reason: "Invalid session" };
  return { ok: true, userId: data.user.id };
}

export function requireCronOnly(req: Request): GuardResult {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");
  if (!cronSecret) return { ok: false, reason: "CRON_SECRET not configured" };
  if (provided !== cronSecret) return { ok: false, reason: "Invalid cron secret" };
  return { ok: true, viaCron: true };
}

export function unauthorized(corsHeaders: Record<string, string>, reason = "Unauthorized") {
  return new Response(JSON.stringify({ error: reason }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
