// Shared WATI client + logger for WhatsApp edge functions.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-wati-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export function normalisePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  // Default to BD country code if missing
  if (digits.length === 11 && digits.startsWith("01")) return "880" + digits.slice(1);
  return digits;
}

export interface SendOptions {
  phone: string;
  body: string;
  companyId?: string | null;
  userId?: string | null;
  templateKey?: string | null;
  metadata?: Record<string, unknown>;
}

export async function sendWhatsApp(opts: SendOptions): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const sb = admin();
  const apiUrl = Deno.env.get("WATI_API_URL");
  const apiToken = Deno.env.get("WATI_API_TOKEN");
  const phone = normalisePhone(opts.phone);

  if (!phone) {
    await sb.from("whatsapp_message_log").insert({
      company_id: opts.companyId ?? null,
      user_id: opts.userId ?? null,
      direction: "outbound",
      template_key: opts.templateKey ?? null,
      phone: opts.phone ?? "",
      body: opts.body,
      status: "failed",
      error: "Invalid phone number",
      metadata: opts.metadata ?? {},
    });
    return { ok: false, error: "Invalid phone number" };
  }

  if (!apiUrl || !apiToken) {
    await sb.from("whatsapp_message_log").insert({
      company_id: opts.companyId ?? null,
      user_id: opts.userId ?? null,
      direction: "outbound",
      template_key: opts.templateKey ?? null,
      phone,
      body: opts.body,
      status: "failed",
      error: "WATI_API_URL or WATI_API_TOKEN secret not configured",
      metadata: opts.metadata ?? {},
    });
    return { ok: false, error: "WATI credentials not configured" };
  }

  try {
    const endpoint = `${apiUrl.replace(/\/+$/, "")}/api/v1/sendSessionMessage/${phone}?messageText=${encodeURIComponent(opts.body)}`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: apiToken.startsWith("Bearer ") ? apiToken : `Bearer ${apiToken}` },
    });
    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(text); } catch { /* ignore */ }
    const ok = res.ok && (parsed.result === true || parsed.ok === true || res.status < 300);

    await sb.from("whatsapp_message_log").insert({
      company_id: opts.companyId ?? null,
      user_id: opts.userId ?? null,
      direction: "outbound",
      template_key: opts.templateKey ?? null,
      phone,
      body: opts.body,
      status: ok ? "sent" : "failed",
      error: ok ? null : text.slice(0, 500),
      wati_message_id: (parsed as { messageId?: string }).messageId ?? null,
      metadata: { ...(opts.metadata ?? {}), http_status: res.status },
    });
    return { ok, error: ok ? undefined : text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from("whatsapp_message_log").insert({
      company_id: opts.companyId ?? null,
      user_id: opts.userId ?? null,
      direction: "outbound",
      template_key: opts.templateKey ?? null,
      phone,
      body: opts.body,
      status: "failed",
      error: msg,
      metadata: opts.metadata ?? {},
    });
    return { ok: false, error: msg };
  }
}

export async function logInbound(row: {
  companyId?: string | null;
  userId?: string | null;
  phone: string;
  body?: string | null;
  messageType?: string;
  mediaUrl?: string | null;
  watiMessageId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const sb = admin();
  await sb.from("whatsapp_message_log").insert({
    company_id: row.companyId ?? null,
    user_id: row.userId ?? null,
    direction: "inbound",
    message_type: row.messageType ?? "text",
    phone: row.phone,
    body: row.body ?? null,
    media_url: row.mediaUrl ?? null,
    status: "received",
    wati_message_id: row.watiMessageId ?? null,
    metadata: row.metadata ?? {},
  });
}
