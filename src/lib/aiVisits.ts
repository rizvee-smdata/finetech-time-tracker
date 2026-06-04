// Shared types and helpers for AI Visit Reports
export type Tone = "formal" | "concise" | "detailed";
export type Lang = "en" | "bn";

export interface ActionItem {
  task: string;
  assignee: string;
  due_days: number;
}

export interface VisitReportContent {
  overview: string;
  discussion_points: string[];
  outcomes: string;
  products_discussed: string[];
  action_items: ActionItem[];
  next_visit_recommendation: string;
}

export const EMPTY_REPORT: VisitReportContent = {
  overview: "",
  discussion_points: [],
  outcomes: "",
  products_discussed: [],
  action_items: [],
  next_visit_recommendation: "",
};

export function normalizeReport(input: unknown): VisitReportContent {
  const r = (input ?? {}) as Partial<VisitReportContent>;
  return {
    overview: typeof r.overview === "string" ? r.overview : "",
    discussion_points: Array.isArray(r.discussion_points)
      ? r.discussion_points.filter((x): x is string => typeof x === "string")
      : [],
    outcomes: typeof r.outcomes === "string" ? r.outcomes : "",
    products_discussed: Array.isArray(r.products_discussed)
      ? r.products_discussed.filter((x): x is string => typeof x === "string")
      : [],
    action_items: Array.isArray(r.action_items)
      ? r.action_items
          .map((a) => {
            const ai = a as Partial<ActionItem>;
            return {
              task: typeof ai?.task === "string" ? ai.task : "",
              assignee: typeof ai?.assignee === "string" ? ai.assignee : "",
              due_days: typeof ai?.due_days === "number" ? ai.due_days : 7,
            };
          })
          .filter((a) => a.task.trim().length > 0)
      : [],
    next_visit_recommendation:
      typeof r.next_visit_recommendation === "string" ? r.next_visit_recommendation : "",
  };
}

export function addDays(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
