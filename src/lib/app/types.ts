// Shared DeskIQ cross-module types.

export type NotificationCategory = "urgent" | "today" | "update" | "win";
export type NotificationSource = "meeting" | "deal" | "time" | "proposal" | "system";

export type Notification = {
  id: string;
  category: NotificationCategory;
  source: NotificationSource;
  title: string;
  description: string;
  createdAt: string; // ISO
  read: boolean;
  link?: { to: string; params?: Record<string, string> };
  actionLabel?: string;
};

export type NotificationPrefs = {
  urgent: boolean;
  today: boolean;
  update: boolean;
  win: boolean;
  stallingThreshold: number; // alert when deal score drops below
  budgetThresholdPct: number; // alert when project budget consumption >= this
};

export type AppSettings = {
  company: {
    name: string;
    tagline: string;
    logoDataUrl?: string;
    address: string;
    phone: string;
    email: string;
    website: string;
    currency: "BDT" | "USD";
  };
  team: { id: string; name: string; role: string; email: string }[];
  workingHours: {
    dailyTargetHours: number;
    billableTargetHours: number;
    workingDays: number[]; // 0..6 Sun..Sat
  };
  healthThresholds: { healthy: number; atRisk: number };
  proposalDefaults: {
    confidentiality: "public" | "confidential" | "strictly_confidential";
    validityDays: number;
    boilerplate: string;
    defaultTerms: string;
  };
  notifications: NotificationPrefs;
};

export const DEFAULT_SETTINGS: AppSettings = {
  company: {
    name: "SmartData Limited",
    tagline: "ICT solutions for enterprise Bangladesh",
    address: "Dhaka, Bangladesh",
    phone: "+880 1700 000000",
    email: "hello@smartdata.com.bd",
    website: "https://smartdata.com.bd",
    currency: "BDT",
  },
  team: [
    { id: "u1", name: "You", role: "Business Development", email: "you@smartdata.com.bd" },
  ],
  workingHours: {
    dailyTargetHours: 8,
    billableTargetHours: 5,
    workingDays: [1, 2, 3, 4, 5],
  },
  healthThresholds: { healthy: 70, atRisk: 40 },
  proposalDefaults: {
    confidentiality: "confidential",
    validityDays: 30,
    boilerplate:
      "SmartData Limited is a leading ICT solutions partner for enterprise customers across Bangladesh.",
    defaultTerms:
      "Pricing valid for 30 days from issue date. Payment terms: 30% advance, 70% on delivery.",
  },
  notifications: {
    urgent: true,
    today: true,
    update: true,
    win: true,
    stallingThreshold: 40,
    budgetThresholdPct: 75,
  },
};

export type DailyBriefing = {
  greeting: string;
  topPriority: { title: string; reasoning: string; dealId: string | null };
  quickWins: string[];
  watchOut: string;
  motivationalInsight: string;
  focusTimeRecommendation: string;
};
