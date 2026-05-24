import { differenceInDays } from "date-fns";
import type { Deal, DealHealth, HealthStatus, HealthTrend } from "./types";

const STAGE_EXPECTED_DAYS: Record<string, number> = {
  Prospecting: 14,
  Discovery: 21,
  Proposal: 14,
  Negotiation: 21,
};

export function calculateHealthScore(deal: Deal, prevScore?: number, history?: { date: string; score: number }[]): DealHealth {
  const today = new Date();
  const lastContact = new Date(deal.lastContactDate);
  const createdAt = new Date(deal.createdAt);

  const daysSinceContact = Math.max(0, differenceInDays(today, lastContact));
  const recencyScore =
    daysSinceContact <= 2 ? 25 :
    daysSinceContact <= 5 ? 20 :
    daysSinceContact <= 7 ? 15 :
    daysSinceContact <= 14 ? 8 :
    daysSinceContact <= 30 ? 3 : 0;

  const recentInteractions = deal.interactions.filter(
    (i) => differenceInDays(today, new Date(i.date)) <= 30,
  ).length;
  const engagementScore =
    recentInteractions >= 5 ? 25 :
    recentInteractions === 4 ? 20 :
    recentInteractions === 3 ? 15 :
    recentInteractions === 2 ? 10 :
    recentInteractions === 1 ? 5 : 0;

  const daysInStage = Math.max(0, differenceInDays(today, createdAt));
  const expected = STAGE_EXPECTED_DAYS[deal.stage] ?? 21;
  const momentumScore =
    daysInStage <= expected ? 25 :
    daysInStage <= expected * 1.5 ? 18 :
    daysInStage <= expected * 2 ? 10 :
    daysInStage <= expected * 3 ? 5 : 0;

  const recentSentiments = deal.interactions
    .slice(-5)
    .map((i) => (i.sentiment === "positive" ? 1 : i.sentiment === "neutral" ? 0.5 : 0));
  const avgSentiment =
    recentSentiments.length > 0
      ? recentSentiments.reduce((a, b) => a + b, 0) / recentSentiments.length
      : 0.5;
  const sentimentScore = Math.round(avgSentiment * 25);

  const totalScore = recencyScore + engagementScore + momentumScore + sentimentScore;

  const status: HealthStatus =
    totalScore >= 70 ? "healthy" : totalScore >= 40 ? "at_risk" : "stalling";

  let trend: HealthTrend = "stable";
  if (typeof prevScore === "number") {
    if (totalScore > prevScore + 3) trend = "improving";
    else if (totalScore < prevScore - 3) trend = "declining";
  }

  const todayIso = today.toISOString();
  const newHistory = [...(history ?? []), { date: todayIso, score: totalScore }].slice(-10);

  return {
    score: totalScore,
    status,
    lastCalculated: todayIso,
    breakdown: { recencyScore, engagementScore, momentumScore, sentimentScore },
    trend,
    history: newHistory,
  };
}
