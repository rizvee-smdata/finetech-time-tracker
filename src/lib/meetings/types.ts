export type Sentiment = "positive" | "neutral" | "negative";
export type Priority = "high" | "medium" | "low";
export type DealStage =
  | "Prospecting"
  | "Discovery"
  | "Proposal"
  | "Negotiation"
  | "Closed Won"
  | "Closed Lost";

export type ActionItem = {
  id: string;
  task: string;
  owner: string;
  deadline: string;
  priority: Priority;
  done: boolean;
};

export type CRMUpdate = {
  field: string;
  suggestedValue: string;
  accepted: boolean;
};

export type ProcessedMeeting = {
  summary: string;
  actionItems: ActionItem[];
  painPoints: string[];
  objections: string[];
  nextSteps: string[];
  dealStage: DealStage | string;
  sentimentScore: Sentiment;
  followUpEmail: string;
  followUpSubject: string;
  crmUpdates: CRMUpdate[];
};

export type MeetingStatus = "raw" | "processing" | "processed";

export type Meeting = {
  id: string;
  title: string;
  clientName: string;
  clientCompany: string;
  date: string; // ISO
  attendees: string[];
  rawNotes: string;
  processed?: ProcessedMeeting;
  status: MeetingStatus;
  createdAt: string;
};
