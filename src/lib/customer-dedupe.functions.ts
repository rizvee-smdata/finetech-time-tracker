import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DedupeInput } from "@/lib/customer-dedupe.server";

export const findCustomerDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: DedupeInput) => d)
  .handler(async ({ data, context }) => {
    const { findDuplicates } = await import("@/lib/customer-dedupe.server");
    return await findDuplicates(context.supabase, data);
  });
