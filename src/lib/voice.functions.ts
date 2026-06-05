import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ProcessInput = z.object({
  audioPath: z.string().min(1).max(512),
  durationSeconds: z.number().int().min(0).max(600).optional(),
});

const SaveInput = z.object({
  voiceInputId: z.string().uuid(),
  clientName: z.string().max(255).nullable().optional(),
  visitSummary: z.string().max(4000),
  requirements: z.array(z.string().max(500)).max(30),
  productsDiscussed: z.array(z.string().max(200)).max(30),
  actionItems: z.array(z.object({ task: z.string().min(1).max(500), dueDays: z.number().int().min(0).max(365) })).max(30),
  followupDate: z.string().nullable().optional(),
  sentiment: z.enum(["happy", "neutral", "concerned"]).optional(),
  transcript: z.string().max(20000).optional(),
  contactId: z.string().uuid().nullable().optional(),
  companyId: z.string().uuid().nullable().optional(),
});

const extractTool = {
  type: "function" as const,
  function: {
    name: "extract_visit",
    description: "Transcribe the rep's voice note and extract structured CRM data.",
    parameters: {
      type: "object",
      properties: {
        transcript_bn: { type: "string", description: "Bangla transcript (empty string if no Bangla spoken)." },
        transcript_en: { type: "string", description: "English transcript / translation of full speech." },
        detected_language: { type: "string", enum: ["bn", "en", "mixed"] },
        client_name: { type: ["string", "null"] },
        visit_summary: { type: "string", description: "2-3 sentence summary in the same language as the rep spoke." },
        requirements: { type: "array", items: { type: "string" } },
        products_discussed: { type: "array", items: { type: "string" }, description: "Product names in English (Fortinet, Rubrik, HivePro, DEEPX, etc.)" },
        action_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              task: { type: "string" },
              due_days: { type: "integer", minimum: 0, maximum: 365 },
            },
            required: ["task", "due_days"],
          },
        },
        followup_date_days: { type: ["integer", "null"], minimum: 0, maximum: 365 },
        sentiment: { type: "string", enum: ["happy", "neutral", "concerned"] },
        confidence: {
          type: "object",
          properties: {
            client_name: { type: "number", minimum: 0, maximum: 1 },
            visit_summary: { type: "number", minimum: 0, maximum: 1 },
            requirements: { type: "number", minimum: 0, maximum: 1 },
            products_discussed: { type: "number", minimum: 0, maximum: 1 },
            action_items: { type: "number", minimum: 0, maximum: 1 },
            followup_date: { type: "number", minimum: 0, maximum: 1 },
            sentiment: { type: "number", minimum: 0, maximum: 1 },
          },
        },
      },
      required: [
        "transcript_bn",
        "transcript_en",
        "detected_language",
        "visit_summary",
        "requirements",
        "products_discussed",
        "action_items",
        "sentiment",
        "confidence",
      ],
    },
  },
};

const SYSTEM = `You are a CRM data extractor for a B2B sales team in Bangladesh selling cybersecurity & infrastructure products (Fortinet, Rubrik, HivePro, DEEPX, etc.).
The voice note may be Bangla, English, or mixed Banglish.
- Transcribe accurately. Provide both Bangla and English transcripts (translate to English if input was Bangla).
- Extract structured data via the tool. Keep product names in English even if the rep spoke in Bangla.
- If client_name is not clearly stated, return null with low confidence.
- visit_summary should be in the same language the rep predominantly spoke in.
- Use confidence scores honestly: >=0.8 high, 0.5-0.8 medium, <0.5 low.
- For followup_date_days, only set if the rep mentioned a specific timeframe ("next week" = 7, "tomorrow" = 1, "after 3 days" = 3).
- Never add commentary outside the tool call.`;

export const processVoiceInput = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ProcessInput.parse(input))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI service is not configured.");

    const { supabase } = context;
    const userId = (context as { userId?: string }).userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify path belongs to user
    if (userId && !data.audioPath.startsWith(`${userId}/`)) {
      throw new Error("Invalid audio path.");
    }

    // Insert initial row
    if (!userId) throw new Error("Not authenticated.");
    const { data: row, error: insErr } = await supabase
      .from("voice_inputs")
      .insert({
        user_id: userId,
        audio_path: data.audioPath,
        duration_seconds: data.durationSeconds ?? null,
        processing_status: "processing",
      })
      .select("id")
      .single();
    if (insErr || !row) throw new Error(insErr?.message ?? "Failed to create voice input.");

    try {
      // Download audio bytes via admin (RLS on storage allows user too, but admin is simpler here)
      const { data: blob, error: dlErr } = await supabaseAdmin.storage
        .from("voice-recordings")
        .download(data.audioPath);
      if (dlErr || !blob) throw new Error(dlErr?.message ?? "Failed to fetch audio.");

      const ab = await blob.arrayBuffer();
      const bytes = new Uint8Array(ab);
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const base64 = btoa(bin);

      const format = data.audioPath.toLowerCase().endsWith(".webm") ? "webm" : "wav";

      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: SYSTEM },
            {
              role: "user",
              content: [
                { type: "text", text: "Transcribe this sales rep voice note and extract structured CRM data via the tool." },
                { type: "input_audio", input_audio: { data: base64, format } },
              ],
            },
          ],
          tools: [extractTool],
          tool_choice: { type: "function", function: { name: "extract_visit" } },
        }),
      });

      if (res.status === 429) throw new Error("AI is rate-limited — try again in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Workspace → Usage.");
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`AI service error (${res.status}): ${txt.slice(0, 200)}`);
      }

      const payload = await res.json();
      const args = payload?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) throw new Error("AI returned no extraction.");
      const parsed = JSON.parse(args);

      const { data: updated, error: upErr } = await supabase
        .from("voice_inputs")
        .update({
          transcript_bn: parsed.transcript_bn ?? "",
          transcript_en: parsed.transcript_en ?? "",
          detected_language: parsed.detected_language ?? null,
          extracted_data: parsed,
          confidence_scores: parsed.confidence ?? {},
          processing_status: "done",
        })
        .eq("id", row.id)
        .select("*")
        .single();
      if (upErr) throw new Error(upErr.message);
      return updated;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabase
        .from("voice_inputs")
        .update({ processing_status: "failed", error_message: msg.slice(0, 500) })
        .eq("id", row.id);
      throw new Error(msg);
    }
  });

export const saveVoiceInputRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userId = (context as { userId?: string }).userId;
    if (!userId) throw new Error("Not authenticated.");

    // Create visit
    const meetingAt = new Date().toISOString();
    const nextMeetingAt = data.followupDate
      ? new Date(`${data.followupDate}T09:00:00`).toISOString()
      : null;

    const { data: visit, error: vErr } = await supabase
      .from("customer_visits")
      .insert({
        user_id: userId,
        company_id: data.companyId ?? null,
        customer_name: data.clientName?.trim() || "Unspecified",
        meeting_at: meetingAt,
        discussion_summary: data.visitSummary,
        next_action: data.actionItems.map((a) => a.task).join("; ") || null,
        next_meeting_at: nextMeetingAt,
        ai_summary: data.visitSummary,
        ai_sentiment: data.sentiment ?? null,
        ai_action_items: data.actionItems,
        ai_pain_points: data.requirements,
        ai_next_steps: data.actionItems.map((a) => a.task),
        ai_analyzed_at: new Date().toISOString(),
        remarks: data.productsDiscussed.length
          ? `Products discussed: ${data.productsDiscussed.join(", ")}`
          : null,
      })
      .select("id")
      .single();
    if (vErr) throw new Error(`Failed to create visit: ${vErr.message}`);

    // Create tasks (tms_tasks requires company_id; skip if none)
    const taskIds: string[] = [];
    if (data.companyId) {
      for (const ai of data.actionItems) {
        const due = new Date();
        due.setDate(due.getDate() + ai.dueDays);
        const { data: t, error: tErr } = await supabase
          .from("tms_tasks")
          .insert({
            company_id: data.companyId,
            title: ai.task,
            description: `From voice note on ${new Date().toLocaleString()}${data.clientName ? ` — Client: ${data.clientName}` : ""}`,
            task_type: "task",
            priority: data.sentiment === "concerned" ? "high" : "medium",
            due_date: due.toISOString().slice(0, 10),
            created_by: userId,
          })
          .select("id")
          .single();
        if (!tErr && t) taskIds.push(t.id);
      }
    }

    // Update voice_inputs with links
    await supabase
      .from("voice_inputs")
      .update({
        linked_visit_id: visit.id,
        linked_task_ids: taskIds.length ? taskIds : null,
        linked_contact_id: data.contactId ?? null,
        company_id: data.companyId ?? null,
      })
      .eq("id", data.voiceInputId);

    return { visitId: visit.id, taskIds };
  });

export const discardVoiceInput = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ voiceInputId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("voice_inputs")
      .select("audio_path")
      .eq("id", data.voiceInputId)
      .single();
    if (row?.audio_path) {
      await supabase.storage.from("voice-recordings").remove([row.audio_path]);
    }
    await supabase.from("voice_inputs").delete().eq("id", data.voiceInputId);
    return { ok: true };
  });
