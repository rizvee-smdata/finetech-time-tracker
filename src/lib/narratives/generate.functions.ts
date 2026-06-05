import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";
import { DEFAULT_ROLE_PROMPTS, type NarrativeRole, type NarrativeMetrics } from "./types";
import { fmtBDT } from "./utils";

const Input = z.object({
  company_id: z.string().uuid(),
  role: z.enum(["ceo", "sales", "ops", "custom"]),
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  week_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  language: z.enum(["en", "bn"]).default("en"),
});

function metricsBrief(m: NarrativeMetrics): string {
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
  return [
    `Revenue closed: ${fmtBDT(m.revenue_closed)}`,
    `vs same week last month: ${fmtBDT(m.revenue_prev_period)} (${pct(m.revenue_closed - m.revenue_prev_period, m.revenue_prev_period || 1)}% change)`,
    `Weekly target: ${fmtBDT(m.revenue_target)} (attainment ${pct(m.revenue_closed, m.revenue_target)}%)`,
    `New deals: ${m.new_deals_count} (${fmtBDT(m.new_deals_value)})`,
    `Pipeline value: ${fmtBDT(m.pipeline_value)}`,
    `Pipeline by stage: ${m.pipeline_by_stage.map((s) => `${s.stage}=${s.count}/${fmtBDT(s.value)}`).join(", ") || "n/a"}`,
    `Visits done: ${m.visits_done} / target ${m.visits_target} (${pct(m.visits_done, m.visits_target)}%)`,
    `Attendance rate: ${m.attendance_rate}%`,
    `Top rep: ${m.top_rep ? `${m.top_rep.name} (${fmtBDT(m.top_rep.revenue)})` : "none"}`,
    `At-risk clients: ${m.at_risk_clients}`,
    `NPS avg: ${m.nps_avg ?? "n/a"}`,
    `Expenses: ${fmtBDT(m.expenses_total)} / budget ${fmtBDT(m.expenses_budget)}`,
    `Rep breakdown (top 5): ${(m.rep_breakdown || []).slice(0, 5).map((r) => `${r.name}: ${fmtBDT(r.revenue)}/${r.visits}v/${r.deals}d`).join("; ")}`,
  ].join("\n");
}

export async function generateNarrativeBody(opts: {
  role: NarrativeRole;
  metrics: NarrativeMetrics;
  weekLabel: string;
  language: "en" | "bn";
  roleDescriptionOverride?: string;
  customKpis?: string[];
}): Promise<{ body_md: string; summary: string; title: string }> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const gateway = createLovableAiGatewayProvider(key);

  const baseSystem = opts.roleDescriptionOverride?.trim() || DEFAULT_ROLE_PROMPTS[opts.role];
  const langInstr = opts.language === "bn"
    ? " Write the response in Bangla (বাংলা) but keep numbers and currency in English digits with BDT/lakh/crore."
    : " Write the response in English.";
  const kpiInstr = opts.customKpis?.length
    ? ` Pay extra attention to these custom KPIs: ${opts.customKpis.join(", ")}.`
    : "";
  const system = baseSystem + langInstr + kpiInstr +
    " Output ONLY markdown. Start with a single H2 heading, then prose. End with a 'Key Actions Required' bullet list.";

  const userPrompt = `Week: ${opts.weekLabel}\n\nMetrics:\n${metricsBrief(opts.metrics)}\n\nWrite the weekly briefing now.`;

  const { text } = await generateText({
    model: gateway("google/gemini-2.5-flash"),
    system,
    prompt: userPrompt,
  });

  const body_md = text.trim();
  const firstLine = body_md.split("\n").find((l) => l.replace(/^#+\s*/, "").trim().length > 0) || "Weekly Briefing";
  const title = firstLine.replace(/^#+\s*/, "").trim().slice(0, 140);
  // Summary = first paragraph after heading, max 280 chars
  const para = body_md.split(/\n{2,}/).find((p) => !p.trim().startsWith("#")) || "";
  const summary = para.replace(/[*_`#>]/g, "").trim().slice(0, 280);

  return { body_md, summary, title };
}

export const generateNarrative = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { aggregateWeeklyMetrics } = await import("./aggregate.server");

    // Settings (optional)
    const { data: settingsRow } = await supabase
      .from("narrative_settings")
      .select("*")
      .eq("company_id", data.company_id)
      .eq("role", data.role)
      .maybeSingle();

    const metrics = await aggregateWeeklyMetrics(supabase, data.company_id, data.week_start, data.week_end);

    const weekLabel = `${data.week_start} → ${data.week_end}`;
    const out = await generateNarrativeBody({
      role: data.role,
      metrics,
      weekLabel,
      language: (settingsRow?.language as any) || data.language,
      roleDescriptionOverride: settingsRow?.role_description || undefined,
      customKpis: settingsRow?.custom_kpis || [],
    });

    const { data: inserted, error } = await supabase
      .from("narrative_reports")
      .insert({
        company_id: data.company_id,
        role: data.role,
        week_start: data.week_start,
        week_end: data.week_end,
        language: (settingsRow?.language as any) || data.language,
        title: out.title,
        summary: out.summary,
        body_md: out.body_md,
        metrics,
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return inserted;
  });
