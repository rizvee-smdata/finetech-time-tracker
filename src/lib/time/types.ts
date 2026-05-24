export const TIME_CATEGORIES = [
  "Pre-Sales",
  "Proposal Writing",
  "Client Meeting",
  "Internal Meeting",
  "Business Development",
  "Technical Demo",
  "Follow-up",
  "Admin",
  "Research",
  "Partner Management",
] as const;

export type TimeCategory = (typeof TIME_CATEGORIES)[number];

export type TimeEntry = {
  id: string;
  description: string;
  rawDescription: string;
  dealId?: string;
  clientName?: string;
  clientCompany?: string;
  category: TimeCategory;
  billable: boolean;
  startTime: string; // ISO
  endTime?: string; // ISO
  duration: number; // minutes
  aiClassified: boolean;
  tags: string[];
};

export type TimerState = {
  isRunning: boolean;
  isPaused: boolean;
  startTime: string | null; // ISO
  pausedAt: string | null; // ISO when paused
  accumulatedSec: number; // accumulated time before current run
  currentDescription: string;
  dealId?: string;
  category?: TimeCategory;
  billable?: boolean;
  tags?: string[];
};

export type DailyTarget = {
  totalHours: number;
  billableHours: number;
  bdHours: number;
};

export type ProjectBudget = {
  dealId: string;
  budgetedHours: number;
  warningThreshold: number; // percent, default 75
};

export type Alert = {
  id: string;
  type: "deal_stalling" | "follow_up_overdue" | "budget_warning" | "close_approaching" | "idle_timer";
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  timestamp: string;
  link?: string;
  actionLabel?: string;
};

export const CATEGORY_COLORS: Record<TimeCategory, string> = {
  "Pre-Sales": "#8B5CF6",
  "Proposal Writing": "#A78BFA",
  "Client Meeting": "#6366F1",
  "Internal Meeting": "#64748B",
  "Business Development": "#10B981",
  "Technical Demo": "#3B82F6",
  "Follow-up": "#F59E0B",
  Admin: "#94A3B8",
  Research: "#06B6D4",
  "Partner Management": "#EC4899",
};

export const DEFAULT_DAILY_TARGET: DailyTarget = {
  totalHours: 8,
  billableHours: 5,
  bdHours: 3,
};
