import type { Database } from "@/integrations/supabase/types";

type Lead = Database["public"]["Tables"]["crm_leads"]["Row"];

export type ScoredLead = Lead & {
  score: number;
  scoreBand: "hot" | "warm" | "cool" | "cold";
  scoreFactors: { label: string; value: number }[];
};

const STAGE_POINTS: Record<string, number> = {
  new: 5,
  qualified: 15,
  proposal: 25,
  negotiation: 35,
  won: 0,
  lost: 0,
};

const PRIORITY_POINTS: Record<string, number> = {
  low: 0,
  medium: 5,
  high: 15,
};

export function scoreLead(lead: Lead, activityCount = 0): ScoredLead {
  const factors: { label: string; value: number }[] = [];

  // Stage progression
  const stagePts = STAGE_POINTS[lead.stage] ?? 0;
  if (stagePts) factors.push({ label: `Stage: ${lead.stage}`, value: stagePts });

  // Deal value (log scale, capped at 25)
  const value = Number(lead.expected_value ?? 0);
  if (value > 0) {
    const valPts = Math.min(25, Math.round(Math.log10(value + 1) * 5));
    factors.push({ label: "Deal value", value: valPts });
  }

  // Probability
  const probPts = Math.round((lead.probability ?? 0) / 5); // 0-20
  if (probPts) factors.push({ label: "Probability", value: probPts });

  // Priority
  const prioPts = PRIORITY_POINTS[lead.priority] ?? 0;
  if (prioPts) factors.push({ label: `Priority: ${lead.priority}`, value: prioPts });

  // Recency of last activity (decay)
  const lastActivity = lead.last_activity_at ? new Date(lead.last_activity_at) : null;
  if (lastActivity) {
    const daysSince = (Date.now() - lastActivity.getTime()) / 86400000;
    let recPts = 0;
    if (daysSince <= 1) recPts = 15;
    else if (daysSince <= 3) recPts = 10;
    else if (daysSince <= 7) recPts = 5;
    else if (daysSince > 30) recPts = -10;
    if (recPts) factors.push({ label: recPts > 0 ? "Recent activity" : "Stale lead", value: recPts });
  }

  // Engagement (activity count)
  if (activityCount > 0) {
    const engPts = Math.min(15, activityCount * 2);
    factors.push({ label: `${activityCount} activities`, value: engPts });
  }

  // Closing soon
  if (lead.expected_close_date) {
    const close = new Date(lead.expected_close_date);
    const daysToClose = (close.getTime() - Date.now()) / 86400000;
    if (daysToClose >= 0 && daysToClose <= 14) {
      factors.push({ label: "Closing soon", value: 10 });
    } else if (daysToClose < 0 && lead.stage !== "won" && lead.stage !== "lost") {
      factors.push({ label: "Past close date", value: -10 });
    }
  }

  // Won/lost terminal states
  if (lead.stage === "won" || lead.stage === "lost") {
    return {
      ...lead,
      score: 0,
      scoreBand: "cold",
      scoreFactors: [{ label: lead.stage === "won" ? "Closed-won" : "Closed-lost", value: 0 }],
    };
  }

  const score = Math.max(0, Math.min(100, factors.reduce((sum, f) => sum + f.value, 0)));
  const scoreBand: ScoredLead["scoreBand"] =
    score >= 70 ? "hot" : score >= 45 ? "warm" : score >= 20 ? "cool" : "cold";

  return { ...lead, score, scoreBand, scoreFactors: factors };
}

export const BAND_META: Record<ScoredLead["scoreBand"], { label: string; color: string; ring: string }> = {
  hot: { label: "Hot", color: "bg-red-500/10 text-red-600 border-red-500/30", ring: "ring-red-500/40" },
  warm: { label: "Warm", color: "bg-orange-500/10 text-orange-600 border-orange-500/30", ring: "ring-orange-500/40" },
  cool: { label: "Cool", color: "bg-blue-500/10 text-blue-600 border-blue-500/30", ring: "ring-blue-500/40" },
  cold: { label: "Cold", color: "bg-muted text-muted-foreground border-border", ring: "ring-muted" },
};
