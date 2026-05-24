import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const captureSchema = z.object({
  customer_name: z.string().min(1).max(255),
  company_name: z.string().max(255).optional().nullable(),
  contact_person: z.string().max(255).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  phone: z.string().max(64).optional().nullable(),
  location: z.string().max(255).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  expected_value: z.number().nonnegative().max(1_000_000_000).optional().nullable(),
  currency: z.string().length(3).optional(),
  source_label: z.string().max(120).optional(),
  metadata: z.record(z.string().max(64), z.any()).optional(),
});

function cors(extra: Record<string, string> = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-capture-key, Authorization",
    "Content-Type": "application/json",
    ...extra,
  };
}

export const Route = createFileRoute("/api/public/hooks/crm-lead-capture")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors() }),
      POST: async ({ request }) => {
        const token =
          request.headers.get("x-capture-key") ||
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
          "";
        if (!token || token.length > 128) {
          return new Response(JSON.stringify({ error: "Missing or invalid capture key" }), { status: 401, headers: cors() });
        }

        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: cors() });
        }

        const parsed = captureSchema.safeParse(payload);
        if (!parsed.success) {
          return new Response(
            JSON.stringify({ error: "Validation failed", issues: parsed.error.issues.slice(0, 10) }),
            { status: 422, headers: cors() },
          );
        }
        const data = parsed.data;

        const { data: key, error: keyErr } = await supabaseAdmin
          .from("crm_capture_keys")
          .select("id, company_id, default_assignee, default_source, is_active")
          .eq("token", token)
          .maybeSingle();
        if (keyErr || !key || !key.is_active) {
          return new Response(JSON.stringify({ error: "Invalid capture key" }), { status: 401, headers: cors() });
        }

        const owner = key.default_assignee;
        const insertPayload: Record<string, unknown> = {
          company_id: key.company_id,
          source: "manual",
          lead_source: key.default_source || "inbound",
          customer_name: data.customer_name,
          company_name: data.company_name ?? null,
          contact_person: data.contact_person ?? null,
          email: data.email ?? null,
          phone: data.phone ?? null,
          location: data.location ?? null,
          notes: data.source_label
            ? `[${data.source_label}] ${data.notes ?? ""}`.trim()
            : (data.notes ?? null),
          expected_value: data.expected_value ?? null,
          currency: data.currency ?? "USD",
          assigned_to: owner,
          created_by: owner,
        };
        if (!insertPayload.created_by) {
          return new Response(
            JSON.stringify({ error: "This capture key has no default assignee configured" }),
            { status: 412, headers: cors() },
          );
        }

        const { data: lead, error: insErr } = await supabaseAdmin
          .from("crm_leads")
          .insert(insertPayload)
          .select("id")
          .single();
        if (insErr) {
          return new Response(JSON.stringify({ error: insErr.message }), { status: 500, headers: cors() });
        }

        if (data.metadata && Object.keys(data.metadata).length > 0) {
          await supabaseAdmin.from("crm_lead_activities").insert({
            lead_id: lead.id,
            activity_type: "note",
            title: "Capture metadata",
            body: JSON.stringify(data.metadata, null, 2),
          });
        }

        await supabaseAdmin
          .from("crm_capture_keys")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", key.id);

        return new Response(JSON.stringify({ ok: true, lead_id: lead.id }), { status: 201, headers: cors() });
      },
    },
  },
});
