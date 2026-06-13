import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";

type Input = {
  companyId: string;
  customer_name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
};

function normPhone(s?: string | null) {
  return (s ?? "").replace(/\D+/g, "");
}
function normStr(s?: string | null) {
  return (s ?? "").trim().toLowerCase();
}

export const findCustomerDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Input) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const name = normStr(data.customer_name);
    const email = normStr(data.email);
    const phone = normPhone(data.phone);
    const contact = normStr(data.contact_person);
    if (!name && !email && !phone) return { duplicates: [] };

    // Fetch a candidate pool (cheap prefilter)
    const { data: rows, error } = await supabase
      .from("customers")
      .select("id, customer_name, contact_person, email, phone")
      .eq("company_id", data.companyId)
      .limit(2000);
    if (error) throw error;

    // Cheap deterministic match (email or phone exact, or very similar name)
    const exact: typeof rows = [];
    const candidates: typeof rows = [];
    for (const r of rows ?? []) {
      const rEmail = normStr(r.email);
      const rPhone = normPhone(r.phone);
      const rName = normStr(r.customer_name);
      const rContact = normStr(r.contact_person);
      if ((email && rEmail && rEmail === email) || (phone && rPhone && rPhone === phone && phone.length >= 6)) {
        exact.push(r);
        continue;
      }
      // name similarity heuristic prefilter
      if (name && rName) {
        if (rName === name) { exact.push(r); continue; }
        if (rName.includes(name) || name.includes(rName)) candidates.push(r);
        else if (contact && rContact && rContact === contact) candidates.push(r);
      }
    }

    if (exact.length > 0) {
      return {
        duplicates: exact.slice(0, 5).map((r) => ({ ...r, reason: "Exact match on email, phone, or name" })),
      };
    }

    const pool = candidates.slice(0, 40);
    if (pool.length === 0) return { duplicates: [] };

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { duplicates: [] };

    const gateway = createLovableAiGatewayProvider(apiKey);
    try {
      const { output } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        output: Output.object({
          schema: z.object({
            matches: z.array(z.object({
              id: z.string(),
              confidence: z.number().min(0).max(1),
              reason: z.string(),
            })),
          }),
        }),
        prompt: `You detect duplicate customer records. Given a NEW customer and a list of EXISTING customers, return only those that are very likely the SAME real-world organization or person (account for typos, abbreviations, legal-suffix variations like "Ltd" vs "Limited", spacing, casing, and minor differences in contact info). Do NOT include weak matches.

NEW: ${JSON.stringify({ name: data.customer_name, contact_person: data.contact_person, email: data.email, phone: data.phone })}

EXISTING:
${JSON.stringify(pool)}

Return JSON with "matches": array of { id, confidence (0..1), reason }. Only include items with confidence >= 0.75. Empty array if none.`,
      });

      const ids = new Set(output.matches.filter((m) => m.confidence >= 0.75).map((m) => m.id));
      const reasonById = new Map(output.matches.map((m) => [m.id, m.reason] as const));
      const duplicates = (pool.filter((r) => ids.has(r.id)) ?? []).map((r) => ({
        ...r,
        reason: reasonById.get(r.id) ?? "Possible duplicate",
      }));
      return { duplicates };
    } catch (e) {
      console.error("AI dedupe failed", e);
      return { duplicates: [] };
    }
  });
