import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const tokenInput = z.object({ token: z.string().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/) });

export const getSharedQuote = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }) => {
    const { data: share, error } = await supabaseAdmin
      .from("crm_quote_shares")
      .select("*")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!share) return { ok: false as const, reason: "not_found" as const };
    if (share.revoked_at) return { ok: false as const, reason: "revoked" as const };

    const { data: quote, error: qe } = await supabaseAdmin
      .from("crm_quotes")
      .select("*")
      .eq("id", share.quote_id)
      .single();
    if (qe) throw new Error(qe.message);

    if (quote.valid_until && new Date(quote.valid_until) < new Date()) {
      // still allow viewing but mark expired
    }

    const [{ data: items }, { data: company }, { data: lead }] = await Promise.all([
      supabaseAdmin.from("crm_quote_line_items").select("*").eq("quote_id", quote.id).order("sort_order"),
      supabaseAdmin.from("companies").select("id, name, settings").eq("id", quote.company_id).maybeSingle(),
      supabaseAdmin.from("crm_leads").select("customer_name, company_name, contact_person, email").eq("id", quote.lead_id).maybeSingle(),
    ]);

    // log view
    await supabaseAdmin.from("crm_quote_share_views").insert({ share_id: share.id });
    await supabaseAdmin.from("crm_quote_shares").update({
      view_count: (share.view_count ?? 0) + 1,
      last_viewed_at: new Date().toISOString(),
    }).eq("id", share.id);

    return {
      ok: true as const,
      share: {
        id: share.id,
        response: share.response,
        responded_at: share.responded_at,
        client_name: share.client_name,
        expires_at: share.expires_at,
      },
      quote,
      items: items ?? [],
      company,
      lead,
    };
  });

const respondInput = z.object({
  token: z.string().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  decision: z.enum(["accepted", "revision_requested"]),
  comment: z.string().max(2000).optional(),
  client_name: z.string().max(255).optional(),
});

export const respondToQuote = createServerFn({ method: "POST" })
  .inputValidator((d) => respondInput.parse(d))
  .handler(async ({ data }) => {
    const { data: share, error } = await supabaseAdmin
      .from("crm_quote_shares")
      .select("*")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!share || share.revoked_at) throw new Error("Share link is not available");
    if (share.response) throw new Error("This quote has already been responded to");

    const now = new Date().toISOString();
    await supabaseAdmin.from("crm_quote_shares").update({
      response: data.decision,
      response_comment: data.comment || null,
      client_name: data.client_name || null,
      responded_at: now,
    }).eq("id", share.id);

    if (data.decision === "accepted") {
      const { data: quote } = await supabaseAdmin
        .from("crm_quotes").select("lead_id").eq("id", share.quote_id).single();
      await supabaseAdmin.from("crm_quotes").update({
        status: "accepted",
        decided_at: now,
      }).eq("id", share.quote_id);
      if (quote?.lead_id) {
        await supabaseAdmin.from("crm_leads").update({ stage: "closure" }).eq("id", quote.lead_id);
      }
    }
    return { ok: true as const };
  });
