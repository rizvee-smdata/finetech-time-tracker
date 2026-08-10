import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifyApiKey, logApiRequest } from "@/lib/api/keys.server";

type Resource = {
  table: string;
  select: string;
  writable: string[];
  searchable: string[];
  orderBy: string;
};

const RESOURCES: Record<string, Resource> = {
  leads: {
    table: "crm_leads",
    select:
      "id, customer_name, company_name, contact_person, email, phone, stage, lead_source, expected_value, currency, assigned_to, location, notes, created_at, updated_at",
    writable: [
      "customer_name",
      "company_name",
      "contact_person",
      "email",
      "phone",
      "stage",
      "lead_source",
      "expected_value",
      "currency",
      "assigned_to",
      "location",
      "notes",
    ],
    searchable: ["customer_name", "company_name", "email"],
    orderBy: "created_at",
  },
  customers: {
    table: "customers",
    select: "id, name, email, phone, address, city, country, tier, created_at, updated_at",
    writable: ["name", "email", "phone", "address", "city", "country", "tier"],
    searchable: ["name", "email"],
    orderBy: "created_at",
  },
  contacts: {
    table: "lead_contacts",
    select: "id, lead_id, name, email, phone, title, created_at",
    writable: ["lead_id", "name", "email", "phone", "title"],
    searchable: ["name", "email"],
    orderBy: "created_at",
  },
  tasks: {
    table: "tms_tasks",
    select:
      "id, title, description, status_id, priority, due_date, start_date, project_id, lead_id, created_at, updated_at",
    writable: ["title", "description", "status_id", "priority", "due_date", "start_date", "project_id", "lead_id"],
    searchable: ["title"],
    orderBy: "created_at",
  },
  quotes: {
    table: "crm_quotes",
    select: "id, lead_id, quote_number, status, total, currency, valid_until, created_at, updated_at",
    writable: ["lead_id", "status", "valid_until"],
    searchable: ["quote_number"],
    orderBy: "created_at",
  },
  products: {
    table: "crm_products",
    select: "id, name, sku, unit_price, currency, is_active, created_at",
    writable: ["name", "sku", "unit_price", "currency", "is_active"],
    searchable: ["name", "sku"],
    orderBy: "created_at",
  },
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
  search: z.string().max(120).optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export const Route = createFileRoute("/api/public/v1/$")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async (ctx) => handle(ctx),
      POST: async (ctx) => handle(ctx),
      PATCH: async (ctx) => handle(ctx),
      DELETE: async (ctx) => handle(ctx),
    },
  },
});

async function handle({ request, params }: { request: Request; params: { _splat?: string } }) {
  const started = Date.now();
  const url = new URL(request.url);
  const segments = (params._splat ?? "").split("/").filter(Boolean);

  const token =
    request.headers.get("x-api-key") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  const key = await verifyApiKey(token);
  if (!key) return json({ error: "Invalid or missing API key" }, 401);

  const finish = async (res: Response) => {
    await logApiRequest({
      company_id: key.company_id,
      api_key_id: key.id,
      method: request.method,
      path: url.pathname,
      status_code: res.status,
      duration_ms: Date.now() - started,
    });
    return res;
  };

  const [resourceName, id] = segments;
  if (!resourceName || !RESOURCES[resourceName]) {
    return finish(json({ error: "Unknown resource", resources: Object.keys(RESOURCES) }, 404));
  }
  const resource = RESOURCES[resourceName];

  const needsWrite = request.method !== "GET";
  if (needsWrite && !key.scopes.includes("write")) {
    return finish(json({ error: "API key lacks 'write' scope" }, 403));
  }
  if (!needsWrite && !key.scopes.includes("read") && !key.scopes.includes("write")) {
    return finish(json({ error: "API key lacks 'read' scope" }, 403));
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sb = supabaseAdmin as any;

  try {
    if (request.method === "GET" && id) {
      const { data, error } = await sb
        .from(resource.table)
        .select(resource.select)
        .eq("company_id", key.company_id)
        .eq("id", id)
        .maybeSingle();
      if (error) return finish(json({ error: error.message }, 400));
      if (!data) return finish(json({ error: "Not found" }, 404));
      return finish(json({ data }));
    }

    if (request.method === "GET") {
      const parsed = listQuery.safeParse(Object.fromEntries(url.searchParams));
      if (!parsed.success) return finish(json({ error: "Invalid query", issues: parsed.error.issues }, 422));
      const { limit, offset, search, order } = parsed.data;
      let q = sb
        .from(resource.table)
        .select(resource.select, { count: "exact" })
        .eq("company_id", key.company_id)
        .order(resource.orderBy, { ascending: order === "asc" })
        .range(offset, offset + limit - 1);
      if (search) {
        q = q.or(resource.searchable.map((c) => `${c}.ilike.%${search}%`).join(","));
      }
      const { data, error, count } = await q;
      if (error) return finish(json({ error: error.message }, 400));
      return finish(json({ data: data ?? [], pagination: { limit, offset, total: count ?? 0 } }));
    }

    let body: any = {};
    if (request.method !== "DELETE") {
      try {
        body = await request.json();
      } catch {
        return finish(json({ error: "Invalid JSON body" }, 400));
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return finish(json({ error: "Body must be a JSON object" }, 400));
      }
    }

    const payload: Record<string, unknown> = {};
    for (const field of resource.writable) {
      if (field in body) payload[field] = body[field];
    }

    if (request.method === "POST") {
      if (Object.keys(payload).length === 0) {
        return finish(json({ error: "No writable fields supplied", writable: resource.writable }, 422));
      }
      payload["company_id"] = key.company_id;
      const { data, error } = await sb.from(resource.table).insert(payload).select(resource.select).single();
      if (error) return finish(json({ error: error.message }, 400));
      return finish(json({ data }, 201));
    }

    if (!id) return finish(json({ error: "Resource id required" }, 400));

    if (request.method === "PATCH") {
      if (Object.keys(payload).length === 0) {
        return finish(json({ error: "No writable fields supplied", writable: resource.writable }, 422));
      }
      const { data, error } = await sb
        .from(resource.table)
        .update(payload)
        .eq("company_id", key.company_id)
        .eq("id", id)
        .select(resource.select)
        .maybeSingle();
      if (error) return finish(json({ error: error.message }, 400));
      if (!data) return finish(json({ error: "Not found" }, 404));
      return finish(json({ data }));
    }

    const { error } = await sb.from(resource.table).delete().eq("company_id", key.company_id).eq("id", id);
    if (error) return finish(json({ error: error.message }, 400));
    return finish(json({ deleted: true, id }));
  } catch (e) {
    return finish(json({ error: e instanceof Error ? e.message : "Server error" }, 500));
  }
}
