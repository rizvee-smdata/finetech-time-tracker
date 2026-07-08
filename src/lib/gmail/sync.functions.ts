import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Sync for the calling user. Optional leadId scopes to one lead.
export const syncGmailForMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { leadId?: string }) =>
    z.object({ leadId: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { runSync } = await import("./sync.server");
    return runSync({ userId: context.userId, leadId: data.leadId, scope: data.leadId ? "lead" : "user" });
  });
