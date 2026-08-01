import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LicenseState =
  | "active"
  | "expiring_soon"
  | "in_grace"
  | "read_only"
  | "locked";

const editionEnum = z.enum(["time_tracker", "crm", "suite"]);

export const issueLicense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        customer_name: z.string().trim().min(1).max(160),
        customer_email: z.string().trim().email().max(255),
        bind_domain: z.string().trim().max(255).optional().nullable(),
        edition: editionEnum.default("suite"),
        max_users: z.number().int().min(1).max(100000).nullable().default(null),
        term_years: z.number().int().min(1).max(10).nullable().optional(),
        term_months: z.number().int().min(1).max(120).nullable().default(12),
        starts_at: z.string().optional(),
        grace_days: z.number().int().min(0).max(180).default(14),
        notes: z.string().max(2000).optional(),
        organization_id: z.string().uuid().nullable().optional(),
        parent_license_id: z.string().uuid().nullable().optional(),
        is_renewal_key: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const h = await import("./licenses.server");
    await h.assertVendorAdmin(context.supabase, context.userId);

    const key = h.generateLicenseKey();
    const key_hash = await h.sha256Hex(key);
    const starts_at = data.starts_at || h.today();
    const term_months = data.term_years ? data.term_years * 12 : data.term_months;
    const bind_domain = data.bind_domain ? h.normalizeDomain(data.bind_domain) : null;
    if (bind_domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(bind_domain)) {
      throw new Error("Enter a valid company domain, e.g. acme.com");
    }
    const expires_at = term_months ? h.addMonths(starts_at, term_months) : null;

    const { data: row, error } = await (supabaseAdmin as any)
      .from("licenses")
      .insert({
        key_hash,
        key_prefix: key.slice(0, 9),
        customer_name: data.customer_name,
        customer_email: data.customer_email,
        bind_domain,
        edition: data.edition,
        max_users: data.max_users,
        term_months,
        starts_at,
        expires_at,
        grace_days: data.grace_days,
        status: "issued",
        organization_id: data.organization_id ?? null,
        parent_license_id: data.parent_license_id ?? null,
        is_renewal_key: data.is_renewal_key,
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await h.logEvent(row.id, "generated", {
      edition: data.edition,
      max_users: data.max_users,
      term_months,
      bind_domain,
      expires_at,
      is_renewal_key: data.is_renewal_key,
    }, context.userId);

    await h.sendLicenseKeyEmail({
      to: data.customer_email,
      customerName: data.customer_name,
      key,
      edition: data.edition,
      maxUsers: data.max_users,
      expiresAt: expires_at,
      bindDomain: bind_domain,
    });

    return { id: row.id as string, key, expires_at };
  });

export const listLicenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const h = await import("./licenses.server");
    await h.assertVendorAdmin(context.supabase, context.userId);
    const { data, error } = await (supabaseAdmin as any)
      .from("licenses")
      .select(
        "id, key_prefix, customer_name, customer_email, bind_domain, edition, max_users, term_months, starts_at, expires_at, grace_days, status, organization_id, is_renewal_key, notes, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    const orgIds = Array.from(new Set(rows.map((r) => r.organization_id).filter(Boolean)));
    const orgs = new Map<string, string>();
    const seats = new Map<string, number>();
    if (orgIds.length) {
      const { data: comps } = await (supabaseAdmin as any)
        .from("companies")
        .select("id, name")
        .in("id", orgIds);
      for (const c of comps ?? []) orgs.set(c.id, c.name);
      for (const id of orgIds) seats.set(id, await h.seatsUsed(id));
    }
    return rows.map((r) => ({
      ...r,
      organization_name: r.organization_id ? orgs.get(r.organization_id) ?? null : null,
      seats_used: r.organization_id ? seats.get(r.organization_id) ?? 0 : 0,
    }));
  });

export const getLicenseDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const h = await import("./licenses.server");
    await h.assertVendorAdmin(context.supabase, context.userId);
    const { data: lic, error } = await (supabaseAdmin as any)
      .from("licenses")
      .select(
        "id, key_prefix, customer_name, customer_email, bind_domain, edition, max_users, term_months, starts_at, expires_at, grace_days, status, organization_id, parent_license_id, is_renewal_key, notes, created_at, updated_at",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!lic) throw new Error("License not found");
    const { data: events } = await (supabaseAdmin as any)
      .from("license_events")
      .select("id, event_type, details, actor, created_at")
      .eq("license_id", data.id)
      .order("created_at", { ascending: false });
    let organization_name: string | null = null;
    let seats_used = 0;
    if (lic.organization_id) {
      const { data: comp } = await (supabaseAdmin as any)
        .from("companies")
        .select("name")
        .eq("id", lic.organization_id)
        .maybeSingle();
      organization_name = comp?.name ?? null;
      seats_used = await h.seatsUsed(lic.organization_id);
    }
    return { license: { ...lic, organization_name, seats_used }, events: events ?? [] };
  });

export const updateLicenseStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["suspend", "reinstate", "revoke"]),
        reason: z.string().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const h = await import("./licenses.server");
    await h.assertVendorAdmin(context.supabase, context.userId);
    const status =
      data.action === "suspend" ? "suspended" : data.action === "revoke" ? "revoked" : "active";
    const { error } = await (supabaseAdmin as any)
      .from("licenses")
      .update({ status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await h.logEvent(
      data.id,
      data.action === "suspend" ? "suspended" : data.action === "revoke" ? "revoked" : "reinstated",
      { reason: data.reason ?? null },
      context.userId,
    );
    return { ok: true };
  });

export const changeLicenseTerms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        add_months: z.number().int().min(0).max(120).optional(),
        max_users: z.number().int().min(1).max(100000).nullable().optional(),
        grace_days: z.number().int().min(0).max(180).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const h = await import("./licenses.server");
    await h.assertVendorAdmin(context.supabase, context.userId);
    const { data: lic } = await (supabaseAdmin as any)
      .from("licenses")
      .select("expires_at, max_users, grace_days")
      .eq("id", data.id)
      .maybeSingle();
    if (!lic) throw new Error("License not found");
    const patch: Record<string, unknown> = {};
    if (data.add_months && lic.expires_at) patch.expires_at = h.addMonths(lic.expires_at, data.add_months);
    if (data.max_users !== undefined) patch.max_users = data.max_users;
    if (data.grace_days !== undefined) patch.grace_days = data.grace_days;
    if (!Object.keys(patch).length) return { ok: true };
    const { error } = await (supabaseAdmin as any).from("licenses").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await h.logEvent(data.id, data.max_users !== undefined ? "seats_changed" : "renewed", {
      before: lic,
      after: patch,
    }, context.userId);
    return { ok: true };
  });

export const renewLicense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        term_months: z.number().int().min(1).max(60),
        max_users: z.number().int().min(1).max(100000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const h = await import("./licenses.server");
    await h.assertVendorAdmin(context.supabase, context.userId);
    const { data: lic } = await (supabaseAdmin as any)
      .from("licenses")
      .select("customer_name, customer_email, edition, expires_at, max_users")
      .eq("id", data.id)
      .maybeSingle();
    if (!lic) throw new Error("License not found");
    const now = h.today();
    const base = lic.expires_at && lic.expires_at >= now ? lic.expires_at : now;
    const expires_at = h.addMonths(base, data.term_months);
    const patch: Record<string, unknown> = { expires_at, status: "active", term_months: data.term_months };
    if (data.max_users !== undefined) patch.max_users = data.max_users;
    const { error } = await (supabaseAdmin as any).from("licenses").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await h.logEvent(data.id, "renewed", { old_expiry: lic.expires_at, new_expiry: expires_at, term_months: data.term_months }, context.userId);
    await h.sendLicenseNotice({
      to: lic.customer_email,
      subject: "Your Lavisho license has been renewed",
      title: "License renewed",
      bodyText: `Hello ${lic.customer_name},\n\nYour Lavisho license has been renewed until ${expires_at}.\nSeats: ${(patch.max_users ?? lic.max_users) ?? "Unlimited"}.\n\nThank you for continuing with Lavisho.`,
    });
    return { ok: true, expires_at };
  });

export const issueReplacementKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const h = await import("./licenses.server");
    await h.assertVendorAdmin(context.supabase, context.userId);
    const { data: old } = await (supabaseAdmin as any)
      .from("licenses")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!old) throw new Error("License not found");

    const key = h.generateLicenseKey();
    const key_hash = await h.sha256Hex(key);
    const { data: row, error } = await (supabaseAdmin as any)
      .from("licenses")
      .insert({
        key_hash,
        key_prefix: key.slice(0, 9),
        customer_name: old.customer_name,
        customer_email: old.customer_email,
        edition: old.edition,
        max_users: old.max_users,
        term_months: old.term_months,
        starts_at: old.starts_at,
        expires_at: old.expires_at,
        grace_days: old.grace_days,
        status: old.organization_id ? "active" : "issued",
        organization_id: old.organization_id,
        parent_license_id: old.id,
        notes: `Replacement for ${old.key_prefix ?? old.id}`,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await (supabaseAdmin as any).from("licenses").update({ status: "revoked", organization_id: null }).eq("id", old.id);
    await h.logEvent(old.id, "revoked", { reason: "replaced", replacement_id: row.id }, context.userId);
    await h.logEvent(row.id, "replacement_issued", { replaces: old.id }, context.userId);
    await h.sendLicenseKeyEmail({
      to: old.customer_email,
      customerName: old.customer_name,
      key,
      edition: old.edition,
      maxUsers: old.max_users,
      expiresAt: old.expires_at,
    });
    return { id: row.id as string, key };
  });

export const activateLicense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ license_key: z.string().min(10).max(64), company_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const h = await import("./licenses.server");
    await h.assertOrgAdmin(context.supabase, context.userId, data.company_id);

    // Rate limit: 5 attempts / org / hour
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await (supabaseAdmin as any)
      .from("license_activation_attempts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", data.company_id)
      .gte("created_at", since);
    if ((count ?? 0) >= 5) throw new Error("Too many activation attempts. Try again in an hour.");

    // The activating user must own a verified mailbox — anonymous or
    // unverified accounts can never redeem a key.
    const actorEmail = await h.verifiedEmailOf(context.userId);

    const key = h.normalizeKey(data.license_key);
    const key_hash = await h.sha256Hex(key);
    const key_prefix = key.slice(0, 9);

    const fail = async (reason: string, message: string): Promise<never> => {
      await h.recordAttempt({
        companyId: data.company_id,
        actor: context.userId,
        actorEmail,
        keyHash: key_hash,
        keyPrefix: key_prefix,
        succeeded: false,
        reason,
      });
      throw new Error(message);
    };

    // Global per-key lockout: a leaked key being shopped around dies quickly.
    if ((await h.keyFailureCount(key_hash)) >= h.MAX_KEY_FAILURES) {
      throw new Error(
        "This key has been locked after too many failed activation attempts. Contact Lavisho support.",
      );
    }

    const { data: lic } = await (supabaseAdmin as any)
      .from("licenses")
      .select("*")
      .eq("key_hash", key_hash)
      .maybeSingle();
    if (!lic) await fail("unknown_key", "This license key was not recognised. Please check and try again.");
    if (lic.status === "revoked") await fail("revoked", "This license key has been revoked.");
    if (lic.status === "suspended")
      await fail("suspended", "This license is suspended. Contact Lavisho support.");
    if (lic.expires_at && lic.expires_at < h.today() && !lic.is_renewal_key)
      await fail("expired", "This license has expired.");
    if (lic.organization_id && lic.organization_id !== data.company_id)
      await fail("bound_elsewhere", "This key is already activated for another organization.");

    // Bind to the customer it was sold to: the redeeming account must be the
    // licensed mailbox, or another address on the same corporate domain.
    if (!h.emailMatchesLicense(actorEmail, lic.customer_email, lic.bind_domain)) {
      await h.logEvent(lic.id, "activation_rejected", {
        reason: "email_mismatch",
        organization_id: data.company_id,
      }, context.userId);
      await fail(
        "email_mismatch",
        "This key was issued to a different customer. Sign in with the email address the license was purchased under, or contact Lavisho support.",
      );
    }

    // Renewal key: extend the parent license instead of binding a new one
    if (lic.is_renewal_key && lic.parent_license_id) {
      const { data: parent } = await (supabaseAdmin as any)
        .from("licenses")
        .select("id, expires_at, organization_id")
        .eq("id", lic.parent_license_id)
        .maybeSingle();
      if (!parent || parent.organization_id !== data.company_id)
        await fail("renewal_mismatch", "This renewal key does not match your organization's license.");
      const now = h.today();
      const base = parent.expires_at && parent.expires_at >= now ? parent.expires_at : now;
      const expires_at = h.addMonths(base, lic.term_months ?? 12);
      await (supabaseAdmin as any)
        .from("licenses")
        .update({ expires_at, status: "active", max_users: lic.max_users ?? undefined })
        .eq("id", parent.id);
      await (supabaseAdmin as any).from("licenses").update({ status: "revoked" }).eq("id", lic.id);
      await h.logEvent(parent.id, "renewed", { via: "renewal_key", new_expiry: expires_at }, context.userId);
      await h.recordAttempt({
        companyId: data.company_id,
        actor: context.userId,
        actorEmail,
        keyHash: key_hash,
        keyPrefix: key_prefix,
        succeeded: true,
        reason: "renewal",
      });
      return { ok: true, renewed: true, expires_at };
    }

    const starts_at = lic.starts_at ?? h.today();
    const { error } = await (supabaseAdmin as any)
      .from("licenses")
      .update({ organization_id: data.company_id, status: "active", starts_at })
      .eq("id", lic.id);
    if (error) throw new Error(error.message);
    await h.logEvent(lic.id, "activated", { organization_id: data.company_id, by: actorEmail }, context.userId);
    await h.recordAttempt({
      companyId: data.company_id,
      actor: context.userId,
      actorEmail,
      keyHash: key_hash,
      keyPrefix: key_prefix,
      succeeded: true,
      reason: "activated",
    });

    const { data: comp } = await (supabaseAdmin as any)
      .from("companies")
      .select("name")
      .eq("id", data.company_id)
      .maybeSingle();
    await h.sendActivationConfirmation({
      to: lic.customer_email,
      customerName: lic.customer_name,
      organizationName: comp?.name ?? "your organization",
      actorEmail,
      keyPrefix: lic.key_prefix,
    });

    return {
      ok: true,
      renewed: false,
      edition: lic.edition,
      max_users: lic.max_users,
      expires_at: lic.expires_at,
    };
  });

export const getMyLicense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ company_id: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data }) => {
    const h = await import("./licenses.server");
    return await h.licenseStateFor(data.company_id);
  });

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ user_id: z.string().uuid(), is_active: z.boolean(), company_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const h = await import("./licenses.server");
    await h.assertOrgAdmin(context.supabase, context.userId, data.company_id);
    if (data.is_active) await h.assertSeatAvailable(data.company_id);
    const { error } = await (supabaseAdmin as any)
      .from("profiles")
      .update({ is_active: data.is_active })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const licenseReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const h = await import("./licenses.server");
    await h.assertVendorAdmin(context.supabase, context.userId);
    const { data: rows } = await (supabaseAdmin as any)
      .from("licenses")
      .select("id, customer_name, customer_email, edition, status, max_users, expires_at, organization_id")
      .order("expires_at", { ascending: true, nullsFirst: false });
    const list = (rows ?? []) as any[];
    const seats = new Map<string, number>();
    for (const id of Array.from(new Set(list.map((r) => r.organization_id).filter(Boolean)))) {
      seats.set(id as string, await h.seatsUsed(id as string));
    }
    const enriched = list.map((r) => ({
      ...r,
      seats_used: r.organization_id ? seats.get(r.organization_id) ?? 0 : 0,
      utilization: r.max_users ? Math.round(((r.organization_id ? seats.get(r.organization_id) ?? 0 : 0) / r.max_users) * 100) : null,
    }));
    const { data: events } = await (supabaseAdmin as any)
      .from("license_events")
      .select("id, license_id, event_type, details, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    return { licenses: enriched, events: events ?? [] };
  });

export const resendLicenseEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const h = await import("./licenses.server");
    await h.assertVendorAdmin(context.supabase, context.userId);
    const { data: lic } = await (supabaseAdmin as any)
      .from("licenses")
      .select("customer_name, customer_email, edition, max_users, expires_at, status, key_prefix")
      .eq("id", data.id)
      .maybeSingle();
    if (!lic) throw new Error("License not found");

    await h.sendLicenseNotice({
      to: lic.customer_email,
      subject: "Your Lavisho license details",
      title: "License details",
      bodyText: [
        `Hello ${lic.customer_name},`,
        "",
        "Here are your current Lavisho license details:",
        `Edition: ${lic.edition}`,
        `Seats: ${lic.max_users ?? "Unlimited"}`,
        `Valid until: ${lic.expires_at ?? "Perpetual"}`,
        `Status: ${lic.status}`,
        `Key reference: ${lic.key_prefix ?? "—"}…`,
        "",
        "To activate, sign in as your organization administrator and go to Settings → License.",
        "For security your full key is stored hashed and cannot be re-sent. If you have lost it, reply to this email and we will issue a replacement key.",
      ].join("\n"),
    });
    await h.logEvent(data.id, "details_resent", { to: lic.customer_email }, context.userId);
    return { ok: true, to: lic.customer_email as string };
  });
