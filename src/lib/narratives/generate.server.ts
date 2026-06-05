// Server-only orchestrator used by the weekly cron hook.
import { aggregateWeeklyMetrics } from "./aggregate.server";
import { generateNarrativeBody } from "./generate.functions";
import { DEFAULT_ROLE_PROMPTS, type NarrativeRole } from "./types";
import { fmtBDT } from "./utils";

interface SbClient { from: (t: string) => any }

const ROLES: NarrativeRole[] = ["ceo", "sales", "ops"];

export async function runWeeklyForCompany(
  sb: SbClient,
  companyId: string,
  weekStart: string,
  weekEnd: string,
): Promise<{ created: number; whatsapp_sent: number; errors: string[] }> {
  const errors: string[] = [];
  let created = 0;
  let whatsapp_sent = 0;

  // Load any per-role settings to know which to skip and what overrides apply.
  const { data: settings } = await sb
    .from("narrative_settings").select("*").eq("company_id", companyId);
  const settingsByRole = new Map<string, any>(((settings ?? []) as any[]).map((s) => [s.role, s]));

  const metrics = await aggregateWeeklyMetrics(sb, companyId, weekStart, weekEnd);

  for (const role of ROLES) {
    const s = settingsByRole.get(role);
    if (s && s.enabled === false) continue;

    try {
      const out = await generateNarrativeBody({
        role,
        metrics,
        weekLabel: `${weekStart} → ${weekEnd}`,
        language: s?.language || "en",
        roleDescriptionOverride: s?.role_description || DEFAULT_ROLE_PROMPTS[role],
        customKpis: s?.custom_kpis || [],
      });
      const channels = (s?.channels as string[]) || ["in_app"];
      const { data: inserted, error } = await sb.from("narrative_reports").insert({
        company_id: companyId,
        role,
        week_start: weekStart,
        week_end: weekEnd,
        language: s?.language || "en",
        title: out.title,
        summary: out.summary,
        body_md: out.body_md,
        metrics,
        delivered_channels: channels,
      }).select("*").single();
      if (error) {
        errors.push(`${role}: ${error.message}`);
        continue;
      }
      created += 1;

      // WhatsApp delivery (best effort)
      if (channels.includes("whatsapp") && (s?.whatsapp_recipients as string[])?.length) {
        const link = `https://project--4b057a3a-1c4d-4b4b-afb2-b4ad1f521b36.lovable.app/narratives/${inserted.id}`;
        const attainmentPct = metrics.revenue_target
          ? Math.round((metrics.revenue_closed / metrics.revenue_target) * 100)
          : 0;
        const body = [
          `📊 Weekly Business Summary — ${weekStart} → ${weekEnd}`,
          `Revenue: ${fmtBDT(metrics.revenue_closed)} (${attainmentPct}% of weekly target)`,
          `Pipeline: ${fmtBDT(metrics.pipeline_value)}`,
          `Visits: ${metrics.visits_done} done`,
          out.summary.slice(0, 90),
          `Full report: ${link}`,
        ].join("\n");
        for (const phone of s.whatsapp_recipients as string[]) {
          try {
            await sendWhatsApp(sb, { companyId, phone, body, templateKey: `narrative_${role}` });
            whatsapp_sent += 1;
          } catch (e) {
            errors.push(`wa ${role} ${phone}: ${(e as Error).message}`);
          }
        }
      }
    } catch (e) {
      errors.push(`${role}: ${(e as Error).message}`);
    }
  }

  return { created, whatsapp_sent, errors };
}

async function sendWhatsApp(sb: SbClient, opts: {
  companyId: string; phone: string; body: string; templateKey: string;
}) {
  const apiUrl = process.env.WATI_API_URL;
  const apiToken = process.env.WATI_API_TOKEN;
  const digits = (opts.phone || "").replace(/[^\d]/g, "");
  const phone = digits.length === 11 && digits.startsWith("01") ? "880" + digits.slice(1) : digits;
  if (!apiUrl || !apiToken || !phone) {
    await sb.from("whatsapp_message_log").insert({
      company_id: opts.companyId, direction: "outbound", template_key: opts.templateKey,
      phone: opts.phone, body: opts.body, status: "failed",
      error: !apiUrl || !apiToken ? "WATI not configured" : "Invalid phone",
    }).then(() => undefined, () => undefined);
    return;
  }
  const endpoint = `${apiUrl.replace(/\/+$/, "")}/api/v1/sendSessionMessage/${phone}?messageText=${encodeURIComponent(opts.body)}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: apiToken.startsWith("Bearer ") ? apiToken : `Bearer ${apiToken}` },
  });
  const text = await res.text();
  await sb.from("whatsapp_message_log").insert({
    company_id: opts.companyId, direction: "outbound", template_key: opts.templateKey,
    phone, body: opts.body, status: res.ok ? "sent" : "failed",
    error: res.ok ? null : text.slice(0, 500),
  }).then(() => undefined, () => undefined);
}
