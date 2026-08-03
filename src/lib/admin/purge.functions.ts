import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const purgeCompanyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        company_id: z.string().uuid(),
        mode: z.enum(["data", "all"]),
        confirm: z.string().min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await (context.supabase as any).rpc("purge_company_data", {
      _company_id: data.company_id,
      _mode: data.mode,
      _confirm: data.confirm,
    });
    if (error) throw new Error(error.message);
    return result as {
      ok: boolean;
      company: string;
      mode: string;
      total_rows: number;
      per_table: Record<string, number>;
      skipped: string[];
    };
  });
