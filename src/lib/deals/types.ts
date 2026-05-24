export type DealStage =
  | "Prospecting"
  | "Discovery"
  | "Proposal"
  | "Negotiation"
  | "Closed Won"
  | "Closed Lost";

export const DEAL_STAGES: DealStage[] = [
  "Prospecting",
  "Discovery",
  "Proposal",
  "Negotiation",
  "Closed Won",
  "Closed Lost",
];

export type InteractionType =
  | "meeting"
  | "email"
  | "call"
  | "demo"
  | "proposal_sent"
  | "follow_up";

export type Sentiment = "positive" | "neutral" | "negative";

export type Interaction = {
  id: string;
  type: InteractionType;
  date: string; // ISO
  notes: string;
  sentiment: Sentiment;
  conductedBy: string;
};

export type ScoreBreakdown = {
  recencyScore: number;
  engagementScore: number;
  momentumScore: number;
  sentimentScore: number;
};

export type HealthStatus = "healthy" | "at_risk" | "stalling";
export type HealthTrend = "improving" | "stable" | "declining";

export type DealHealth = {
  score: number;
  status: HealthStatus;
  lastCalculated: string;
  breakdown: ScoreBreakdown;
  trend: HealthTrend;
  history: { date: string; score: number }[];
};

export type NextBestActionType =
  | "call"
  | "email"
  | "meeting"
  | "proposal"
  | "escalate"
  | "demo";

export type NextBestAction = {
  id: string;
  priority: 1 | 2 | 3;
  action: string;
  reasoning: string;
  actionType: NextBestActionType;
  urgency: "today" | "this_week" | "this_month";
  estimatedImpact: "high" | "medium" | "low";
  draftContent?: string;
  completed: boolean;
  completedAt?: string;
};

export type AIDealAnalysis = {
  dealDiagnosis: string;
  winProbability: number;
  estimatedCloseDate: string;
  riskFactors: string[];
  positiveSignals: string[];
  competitorStrategy: string;
  dealCoachingTip: string;
  generatedAt: string;
};

export type Deal = {
  id: string;
  title: string;
  clientName: string;
  clientCompany: string;
  industry: string;
  dealValue: number;
  currency: "BDT" | "USD";
  stage: DealStage;
  probability: number;
  createdAt: string;
  expectedCloseDate: string;
  lastContactDate: string;
  assignedTo: string;
  competitors: string[];
  products: string[];
  interactions: Interaction[];
  healthScore?: DealHealth;
  nextBestActions?: NextBestAction[];
  aiAnalysis?: AIDealAnalysis;
  lossReason?: string;
};

export function formatDealValue(d: Pick<Deal, "dealValue" | "currency">) {
  const locale = d.currency === "BDT" ? "en-BD" : "en-US";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: d.currency,
      maximumFractionDigits: 0,
    }).format(d.dealValue || 0);
  } catch {
    return `${d.currency} ${(d.dealValue || 0).toLocaleString()}`;
  }
}

export const HEALTH_COLORS: Record<HealthStatus, { hex: string; text: string; bg: string; border: string; label: string }> = {
  healthy: { hex: "#10B981", text: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/40", label: "Healthy" },
  at_risk: { hex: "#F59E0B", text: "text-amber-400", bg: "bg-amber-500/15", border: "border-amber-500/40", label: "At Risk" },
  stalling: { hex: "#EF4444", text: "text-red-400", bg: "bg-red-500/15", border: "border-red-500/40", label: "Stalling" },
};
