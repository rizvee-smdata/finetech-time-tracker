import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CompanyInput = z.object({ companyId: z.string().uuid() });

export const recalculateVisitGaps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CompanyInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: isAdmin }, { data: isManager }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" as const }),
      supabase.rpc("has_role", { _user_id: userId, _role: "manager" as const }),
    ]);
    if (!isAdmin && !isManager) throw new Response("Forbidden", { status: 403 });
    const { data: count, error } = await supabase.rpc("compute_visit_gaps", { _company: data.companyId });
    if (error) throw new Response(error.message, { status: 500 });
    return { count };
  });

const SnoozeInput = z.object({
  customerId: z.string().uuid(),
  companyId: z.string().uuid(),
  days: z.number().int().min(1).max(30).default(7),
  reason: z.string().optional(),
});

export const snoozeAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SnoozeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const until = new Date();
    until.setDate(until.getDate() + data.days);
    const { error } = await supabase.from("visit_snoozes").insert({
      customer_id: data.customerId,
      company_id: data.companyId,
      user_id: userId,
      snoozed_until: until.toISOString(),
      reason: data.reason ?? null,
    });
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true, until: until.toISOString() };
  });
