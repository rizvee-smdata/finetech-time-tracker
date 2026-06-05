export type CardScanStatus = "pending" | "processed" | "saved" | "discarded" | "failed";

export type ExtractedFields = {
  full_name: string | null;
  job_title: string | null;
  company_name: string | null;
  phones: string[];
  emails: string[];
  address: string | null;
  website: string | null;
  linkedin: string | null;
  industry_guess: string | null;
  language_detected: string | null;
};

export type Confidence = Partial<Record<keyof ExtractedFields, number>>;

export type DuplicateMatch = {
  id: string;
  customer_name: string;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  match_reason: string;
};

export type CardScan = {
  id: string;
  company_id: string;
  user_id: string;
  source: "card" | "document" | "bulk";
  file_path: string;
  file_mime: string | null;
  status: CardScanStatus;
  extracted: ExtractedFields;
  confidence: Confidence;
  industry_guess: string | null;
  language_detected: string | null;
  duplicate_lead_id: string | null;
  linked_lead_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  duplicate?: DuplicateMatch | null;
  signed_url?: string | null;
};

export function confidenceColor(score: number | undefined | null) {
  const s = typeof score === "number" ? score : 0;
  if (s >= 0.85) return "bg-emerald-500";
  if (s >= 0.6) return "bg-amber-500";
  return "bg-red-500";
}

export function confidenceLabel(score: number | undefined | null) {
  const s = typeof score === "number" ? score : 0;
  if (s >= 0.85) return "High confidence";
  if (s >= 0.6) return "Medium — please verify";
  return "Low — needs verification";
}
