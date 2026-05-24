export type SurveySentiment = "positive" | "neutral" | "negative";

export type SurveyQuestion = {
  id: string;
  label: string;
  type: "text" | "rating" | "yes_no";
};

export type SurveyTemplate = {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  questions: SurveyQuestion[];
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type SurveyResponse = {
  id: string;
  company_id: string;
  template_id: string | null;
  visit_id: string | null;
  lead_id: string | null;
  contract_id: string | null;
  submitted_by: string;
  customer_name: string | null;
  rating: number | null;
  sentiment: SurveySentiment | null;
  answers: Record<string, string | number | boolean>;
  notes: string | null;
  follow_up_required: boolean;
  follow_up_at: string | null;
  created_at: string;
  updated_at: string;
};

export const SENTIMENT_LABEL: Record<SurveySentiment, string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
};

export const SENTIMENT_CLASS: Record<SurveySentiment, string> = {
  positive: "bg-green-500/15 text-green-700 dark:text-green-400",
  neutral: "bg-muted text-muted-foreground",
  negative: "bg-red-500/15 text-red-700 dark:text-red-400",
};

export function inferSentiment(rating: number | null): SurveySentiment | null {
  if (rating == null) return null;
  if (rating >= 4) return "positive";
  if (rating <= 2) return "negative";
  return "neutral";
}
