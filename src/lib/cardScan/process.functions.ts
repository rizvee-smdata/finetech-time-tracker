import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ExtractedFields, Confidence, DuplicateMatch } from "./types";

const InputSchema = z.object({
  company_id: z.string().uuid(),
  file_path: z.string().min(1).max(500),
  file_mime: z.string().min(1).max(120),
  source: z.enum(["card", "document", "bulk"]).default("card"),
});

const extractionTool = {
  type: "function" as const,
  function: {
    name: "submit_card_extraction",
    description: "Submit structured contact details extracted from a business card or document.",
    parameters: {
      type: "object",
      properties: {
        full_name: { type: "string", nullable: true },
        job_title: { type: "string", nullable: true },
        company_name: { type: "string", nullable: true },
        phones: { type: "array", items: { type: "string" } },
        emails: { type: "array", items: { type: "string" } },
        address: { type: "string", nullable: true },
        website: { type: "string", nullable: true },
        linkedin: { type: "string", nullable: true },
        industry_guess: { type: "string", nullable: true },
        language_detected: { type: "string", enum: ["english", "bangla", "mixed", "unknown"] },
        confidence: {
          type: "object",
          properties: {
            full_name: { type: "number" },
            job_title: { type: "number" },
            company_name: { type: "number" },
            phones: { type: "number" },
            emails: { type: "number" },
            address: { type: "number" },
            website: { type: "number" },
            linkedin: { type: "number" },
            industry_guess: { type: "number" },
          },
          additionalProperties: false,
        },
      },
      required: ["phones", "emails", "language_detected", "confidence"],
      additionalProperties: false,
    },
  },
};

function lastDigits(p: string, n = 8) {
  return p.replace(/\D/g, "").slice(-n);
}

export const processCardScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("AI service is not configured.");

    const supabase: any = context.supabase;

    // Download the file
    const { data: blob, error: dlErr } = await supabase.storage
      .from("card-scans")
      .download(data.file_path);
    if (dlErr || !blob) throw new Error(`Could not read uploaded file: ${dlErr?.message ?? "missing"}`);
    const buf = Buffer.from(await blob.arrayBuffer());
    const base64 = buf.toString("base64");
    const dataUrl = `data:${data.file_mime};base64,${base64}`;

    const prompt = `Extract all contact information from this business card or document. Use the submit_card_extraction tool.

Rules:
- For each field present, set its value. For missing fields, set null (except phones/emails which should be empty arrays).
- Phones: include country code if visible. Bangladeshi numbers typically start with +880 or 01.
- Confidence: a number 0–1 per field reflecting how certain you are it is correct and complete.
- language_detected: english / bangla / mixed / unknown.
- industry_guess: infer from company name or title (e.g. "Banking & Finance", "Pharmaceuticals", "ICT", "FMCG").
- Bangla text is supported natively — extract it as-is.`;

    // Hard timeout so the browser doesn't see a generic "Failed to fetch"
    // when the AI gateway hangs or the worker exceeds its limit.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25_000);
    let res: Response;
    try {
      res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
          tools: [extractionTool],
          tool_choice: { type: "function", function: { name: "submit_card_extraction" } },
        }),
      });
    } catch (e: any) {
      if (e?.name === "AbortError") {
        throw new Error("AI took too long to read the card. Please try a clearer, well-lit close-up photo.");
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }

    if (res.status === 429) throw new Error("AI rate limit reached. Please try again shortly.");
    if (res.status === 402) throw new Error("AI usage limit reached. Add credits in Settings.");
    if (!res.ok) {
      const t = await res.text();
      console.error("processCardScan AI error", res.status, t);
      throw new Error(`AI service error (${res.status}).`);
    }

    const payload = await res.json();
    const argsStr = payload?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) throw new Error("AI did not return structured output.");
    const parsed = JSON.parse(argsStr);

    const extracted: ExtractedFields = {
      full_name: parsed.full_name ?? null,
      job_title: parsed.job_title ?? null,
      company_name: parsed.company_name ?? null,
      phones: Array.isArray(parsed.phones) ? parsed.phones.filter(Boolean) : [],
      emails: Array.isArray(parsed.emails) ? parsed.emails.filter(Boolean) : [],
      address: parsed.address ?? null,
      website: parsed.website ?? null,
      linkedin: parsed.linkedin ?? null,
      industry_guess: parsed.industry_guess ?? null,
      language_detected: parsed.language_detected ?? null,
    };
    const confidence: Confidence = parsed.confidence ?? {};

    // Duplicate detection in crm_leads
    let duplicate: DuplicateMatch | null = null;
    const phoneTails = extracted.phones.map((p) => lastDigits(p)).filter((p) => p.length >= 7);
    const emails = extracted.emails.map((e) => e.toLowerCase().trim()).filter(Boolean);
    const ors: string[] = [];
    for (const t of phoneTails) ors.push(`phone.ilike.%${t}%`);
    for (const e of emails) ors.push(`email.eq.${e}`);
    if (extracted.full_name) ors.push(`customer_name.ilike.%${extracted.full_name.slice(0, 40)}%`);
    if (ors.length > 0) {
      const { data: dupes } = await supabase
        .from("crm_leads")
        .select("id, customer_name, company_name, phone, email")
        .eq("company_id", data.company_id)
        .or(ors.join(","))
        .limit(1);
      if (dupes && dupes.length > 0) {
        const d = dupes[0];
        let reason = "Similar name";
        if (emails.includes((d.email ?? "").toLowerCase())) reason = "Same email";
        else if (phoneTails.some((t) => (d.phone ?? "").includes(t))) reason = "Same phone";
        duplicate = {
          id: d.id,
          customer_name: d.customer_name,
          company_name: d.company_name,
          phone: d.phone,
          email: d.email,
          match_reason: reason,
        };
      }
    }

    // Persist scan
    const { data: row, error: insErr } = await supabase
      .from("card_scans")
      .insert({
        company_id: data.company_id,
        user_id: context.userId,
        source: data.source,
        file_path: data.file_path,
        file_mime: data.file_mime,
        status: "processed",
        extracted,
        confidence,
        industry_guess: extracted.industry_guess,
        language_detected: extracted.language_detected,
        duplicate_lead_id: duplicate?.id ?? null,
      })
      .select("*")
      .single();
    if (insErr) throw new Error(insErr.message);

    const { data: signed } = await supabase.storage
      .from("card-scans")
      .createSignedUrl(data.file_path, 60 * 60);

    return { scan: row, duplicate, signed_url: signed?.signedUrl ?? null };
  });

const SaveSchema = z.object({
  scan_id: z.string().uuid(),
  company_id: z.string().uuid(),
  fields: z.object({
    full_name: z.string().min(1).max(200),
    job_title: z.string().max(200).nullable().optional(),
    company_name: z.string().max(200).nullable().optional(),
    phone: z.string().max(60).nullable().optional(),
    email: z.string().max(200).nullable().optional(),
    address: z.string().max(1000).nullable().optional(),
    website: z.string().max(300).nullable().optional(),
    linkedin: z.string().max(300).nullable().optional(),
    industry_guess: z.string().max(120).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  }),
  merge_into_lead_id: z.string().uuid().nullable().optional(),
});

export const saveCardScanToCrm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    let leadId = data.merge_into_lead_id ?? null;
    const f = data.fields;
    const notesParts = [
      f.address ? `Address: ${f.address}` : null,
      f.website ? `Website: ${f.website}` : null,
      f.linkedin ? `LinkedIn: ${f.linkedin}` : null,
      f.industry_guess ? `Industry: ${f.industry_guess}` : null,
      f.notes ? `Notes: ${f.notes}` : null,
      "Source: card_scan",
    ].filter(Boolean).join("\n");

    if (leadId) {
      const { error } = await supabase
        .from("crm_leads")
        .update({
          customer_name: f.full_name,
          contact_person: f.full_name,
          designation: f.job_title,
          company_name: f.company_name,
          phone: f.phone,
          email: f.email,
          location: f.address,
          notes: notesParts,
          last_activity_at: new Date().toISOString(),
        })
        .eq("id", leadId)
        .eq("company_id", data.company_id);
      if (error) throw new Error(error.message);
    } else {
      const { data: ins, error } = await supabase
        .from("crm_leads")
        .insert({
          company_id: data.company_id,
          created_by: context.userId,
          customer_name: f.full_name,
          contact_person: f.full_name,
          designation: f.job_title,
          company_name: f.company_name,
          phone: f.phone,
          email: f.email,
          location: f.address,
          source: "manual",
          lead_source: "manual",
          stage: "new",
          priority: "medium",
          notes: notesParts,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      leadId = ins.id;
    }

    // Also upsert into customers directory (independent of CRM lead RLS)
    // Verify the user belongs to the company before writing.
    const { data: membership } = await supabase
      .from("company_members")
      .select("user_id")
      .eq("company_id", data.company_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    let customerId: string | null = null;
    if (membership) {
      const phoneNorm = (f.phone ?? "").replace(/\D/g, "");
      const emailNorm = (f.email ?? "").toLowerCase().trim();
      let existing: { id: string } | null = null;
      if (emailNorm) {
        const { data: byEmail } = await supabaseAdmin
          .from("customers")
          .select("id")
          .eq("company_id", data.company_id)
          .ilike("email", emailNorm)
          .maybeSingle();
        existing = byEmail ?? null;
      }
      if (!existing && phoneNorm.length >= 7) {
        const { data: byPhone } = await supabaseAdmin
          .from("customers")
          .select("id, phone")
          .eq("company_id", data.company_id)
          .ilike("phone", `%${phoneNorm.slice(-8)}%`)
          .limit(1);
        existing = byPhone?.[0] ?? null;
      }
      if (existing) {
        await supabaseAdmin
          .from("customers")
          .update({
            customer_name: f.company_name || f.full_name,
            contact_person: f.full_name,
            designation: f.job_title,
            email: f.email,
            phone: f.phone,
          })
          .eq("id", existing.id);
        customerId = existing.id;
      } else {
        const { data: ins } = await supabaseAdmin
          .from("customers")
          .insert({
            company_id: data.company_id,
            created_by: context.userId,
            customer_name: f.company_name || f.full_name,
            contact_person: f.full_name,
            designation: f.job_title,
            email: f.email,
            phone: f.phone,
            kind: "customer",
          })
          .select("id")
          .single();
        customerId = ins?.id ?? null;
      }
    }

    await supabase
      .from("card_scans")
      .update({ status: "saved", linked_lead_id: leadId })
      .eq("id", data.scan_id)
      .eq("company_id", data.company_id);

    return { lead_id: leadId, customer_id: customerId };
  });

const StatusSchema = z.object({
  scan_id: z.string().uuid(),
  company_id: z.string().uuid(),
  status: z.enum(["discarded", "pending"]),
});

export const updateCardScanStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { error } = await supabase
      .from("card_scans")
      .update({ status: data.status })
      .eq("id", data.scan_id)
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ListSchema = z.object({
  company_id: z.string().uuid(),
  filter: z.enum(["all", "saved", "discarded", "pending", "processed"]).default("all"),
});

export const listCardScans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListSchema.parse(input))
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    let q = supabase
      .from("card_scans")
      .select("*")
      .eq("company_id", data.company_id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.filter !== "all") q = q.eq("status", data.filter);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const items = await Promise.all(
      (rows ?? []).map(async (r: any) => {
        const { data: signed } = await supabase.storage
          .from("card-scans")
          .createSignedUrl(r.file_path, 60 * 60);
        return { ...r, signed_url: signed?.signedUrl ?? null };
      }),
    );
    return { items };
  });
