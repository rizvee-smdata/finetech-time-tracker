import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function resolveUserCompany(
  supabaseAdmin: any,
  userId: string,
  requested?: string,
): Promise<string> {
  const { data: memberships } = await supabaseAdmin
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId);
  const ids = (memberships ?? []).map((m: any) => m.company_id);
  if (ids.length === 0) throw new Error("You are not a member of any company.");
  if (requested) {
    if (!ids.includes(requested)) throw new Error("You are not a member of that company.");
    return requested;
  }
  return ids[0];
}

export const startGmailAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { origin: string; companyId?: string }) =>
    z.object({ origin: z.string().url(), companyId: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { buildAuthUrl, getCompanyGoogleConfig } = await import("./gmail.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const companyId = await resolveUserCompany(supabaseAdmin, context.userId, data.companyId);
    const config = await getCompanyGoogleConfig(supabaseAdmin, companyId);

    const state = crypto.randomUUID();
    await supabaseAdmin.from("gmail_accounts").upsert(
      {
        user_id: context.userId,
        company_id: companyId,
        gmail_address: "pending",
        status: "disconnected",
        history_id: state,
      },
      { onConflict: "user_id" },
    );
    return {
      url: buildAuthUrl({
        origin: data.origin,
        state: `${context.userId}:${companyId}:${state}`,
        config,
      }),
    };
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
      .select("gmail_address,status,last_synced_at,last_error,company_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    return data;
  });

// Admin: read/write per-company Gmail OAuth config
export const getCompanyGmailConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) =>
    z.object({ companyId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) throw new Error("Only admins can view Gmail config.");
    const { data: cfg } = await supabaseAdmin
      .from("company_gmail_config")
      .select("client_id,workspace_domain,enabled,updated_at")
      .eq("company_id", data.companyId)
      .maybeSingle();
    return cfg;
  });

export const saveCompanyGmailConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string;
    clientId: string;
    clientSecret: string;
    workspaceDomain: string;
    enabled: boolean;
  }) =>
    z
      .object({
        companyId: z.string().uuid(),
        clientId: z.string().min(10),
        clientSecret: z.string().min(10),
        workspaceDomain: z
          .string()
          .min(3)
          .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Invalid domain"),
        enabled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) throw new Error("Only admins can update Gmail config.");
    const { data: member } = await supabaseAdmin
      .from("company_members")
      .select("company_id")
      .eq("user_id", context.userId)
      .eq("company_id", data.companyId)
      .maybeSingle();
    if (!member) throw new Error("You are not a member of that company.");

    const { error } = await supabaseAdmin.from("company_gmail_config").upsert({
      company_id: data.companyId,
      client_id: data.clientId,
      client_secret: data.clientSecret,
      workspace_domain: data.workspaceDomain.toLowerCase(),
      enabled: data.enabled,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("company_members")
      .select("company_id, companies!inner(id,name)")
      .eq("user_id", context.userId);
    return (data ?? []).map((r: any) => ({
      id: r.companies.id,
      name: r.companies.name,
    })) as { id: string; name: string }[];
  });
