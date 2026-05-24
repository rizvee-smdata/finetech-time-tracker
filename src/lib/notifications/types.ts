import {
  Bell,
  Target,
  FileText,
  CreditCard,
  CheckSquare,
  MapPin,
  Clock,
  Receipt,
  MessageSquare,
  Trophy,
  Info,
  Briefcase,
  type LucideIcon,
} from "lucide-react";

export type NotificationCategory =
  | "general"
  | "lead"
  | "quote"
  | "contract"
  | "payment"
  | "task"
  | "visit"
  | "attendance"
  | "expense"
  | "survey"
  | "target"
  | "system";

export const CATEGORY_META: Record<
  NotificationCategory,
  { label: string; icon: LucideIcon; tone: string }
> = {
  general:    { label: "General",    icon: Bell,          tone: "text-muted-foreground bg-muted" },
  lead:       { label: "Leads",      icon: Target,        tone: "text-blue-600 bg-blue-100 dark:bg-blue-900/40 dark:text-blue-200" },
  quote:      { label: "Quotes",     icon: FileText,      tone: "text-purple-600 bg-purple-100 dark:bg-purple-900/40 dark:text-purple-200" },
  contract:   { label: "Contracts",  icon: Briefcase,     tone: "text-indigo-600 bg-indigo-100 dark:bg-indigo-900/40 dark:text-indigo-200" },
  payment:    { label: "Payments",   icon: CreditCard,    tone: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-200" },
  task:       { label: "Tasks",      icon: CheckSquare,   tone: "text-cyan-600 bg-cyan-100 dark:bg-cyan-900/40 dark:text-cyan-200" },
  visit:      { label: "Visits",     icon: MapPin,        tone: "text-amber-600 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-200" },
  attendance: { label: "Attendance", icon: Clock,         tone: "text-rose-600 bg-rose-100 dark:bg-rose-900/40 dark:text-rose-200" },
  expense:    { label: "Expenses",   icon: Receipt,       tone: "text-orange-600 bg-orange-100 dark:bg-orange-900/40 dark:text-orange-200" },
  survey:     { label: "Feedback",   icon: MessageSquare, tone: "text-pink-600 bg-pink-100 dark:bg-pink-900/40 dark:text-pink-200" },
  target:     { label: "Targets",    icon: Trophy,        tone: "text-yellow-600 bg-yellow-100 dark:bg-yellow-900/40 dark:text-yellow-200" },
  system:     { label: "System",     icon: Info,          tone: "text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-200" },
};

export const ALL_CATEGORIES: NotificationCategory[] = [
  "lead","quote","contract","payment","task","visit","attendance","expense","survey","target","system","general",
];

export type Reminder = {
  id: string;
  user_id: string;
  company_id: string | null;
  title: string;
  body: string | null;
  remind_at: string;
  read_at: string | null;
  dismissed_at: string | null;
  category: NotificationCategory;
  link_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};
