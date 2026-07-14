import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listCurrencies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("currencies")
      .select("code, name, symbol, decimals, is_active")
      .eq("is_active", true)
      .order("code");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listRates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ base: z.string().optional() }).parse(raw))
  .handler(async ({ data, context }) => {
    let q = (context.supabase as any)
      .from("exchange_rates")
      .select("id, from_code, to_code, rate, as_of, source")
      .order("as_of", { ascending: false })
      .limit(500);
    if (data.base) q = q.eq("from_code", data.base);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      from_code: z.string().length(3),
      to_code: z.string().length(3),
      rate: z.number().positive(),
      as_of: z.string().optional(),
    }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await (context.supabase as any).rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const as_of = data.as_of ?? new Date().toISOString().slice(0, 10);
    const { error } = await (context.supabase as any)
      .from("exchange_rates")
      .upsert(
        { from_code: data.from_code, to_code: data.to_code, rate: data.rate, as_of, source: "manual" },
        { onConflict: "from_code,to_code,as_of" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getBaseCurrency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ companyId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase as any)
      .from("companies").select("base_currency").eq("id", data.companyId).maybeSingle();
    if (error) throw new Error(error.message);
    return (row?.base_currency ?? "USD") as string;
  });

export const setBaseCurrency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ companyId: z.string().uuid(), code: z.string().length(3) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await (context.supabase as any).rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await (context.supabase as any)
      .from("companies").update({ base_currency: data.code }).eq("id", data.companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const convertAmount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      amount: z.number(),
      from: z.string().length(3),
      to: z.string().length(3),
      asOf: z.string().optional(),
    }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { data: out, error } = await (context.supabase as any).rpc("fx_convert", {
      _amount: data.amount, _from: data.from, _to: data.to,
      _as_of: data.asOf ?? new Date().toISOString().slice(0, 10),
    });
    if (error) throw new Error(error.message);
    return Number(out);
  });
