import { createHash, randomBytes, createHmac, timingSafeEqual } from "node:crypto";

export const API_SCOPES = ["read", "write"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Generates a new API key: `ltt_<prefix>_<secret>` */
export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const prefix = randomBytes(4).toString("hex");
  const secret = randomBytes(24).toString("base64url");
  const raw = `ltt_${prefix}_${secret}`;
  return { raw, prefix, hash: hashApiKey(raw) };
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export function signWebhookPayload(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export type ApiKeyRecord = {
  id: string;
  company_id: string;
  scopes: string[];
  is_active: boolean;
  expires_at: string | null;
};

/** Verifies an incoming API key; returns the key record or null. */
export async function verifyApiKey(raw: string): Promise<ApiKeyRecord | null> {
  if (!raw || raw.length > 200 || !raw.startsWith("ltt_")) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("api_keys")
    .select("id, company_id, scopes, is_active, expires_at")
    .eq("key_hash", hashApiKey(raw))
    .maybeSingle();
  if (error || !data || !data.is_active) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;
  void (supabaseAdmin as any)
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);
  return data as ApiKeyRecord;
}

export async function logApiRequest(entry: {
  company_id: string | null;
  api_key_id: string | null;
  method: string;
  path: string;
  status_code: number;
  duration_ms: number;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).from("api_request_logs").insert(entry);
  } catch {
    /* logging must never break the response */
  }
}
