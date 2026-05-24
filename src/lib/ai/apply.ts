// Client-side action applier — auto-applies agent-proposed actions to the
// existing localStorage stores. Returns a human label per applied action.

import { calculateHealthScore } from "@/lib/deals/scoring";
import type { Deal, NextBestAction, Interaction, InteractionType, Sentiment, DealStage, NextBestActionType } from "@/lib/deals/types";

const DEALS_KEY = "deskiq_deals";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

function readDeals(): Deal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DEALS_KEY);
    return raw ? (JSON.parse(raw) as Deal[]) : [];
  } catch {
    return [];
  }
}
function writeDeals(d: Deal[]) {
  localStorage.setItem(DEALS_KEY, JSON.stringify(d));
  window.dispatchEvent(new CustomEvent("deskiq:deals-updated"));
}

export type AgentAction = {
  type:
    | "update_deal_stage"
    | "add_deal_interaction"
    | "create_next_best_action"
    | "draft_email"
    | "start_timer"
    | "open_route";
  label: string;
  dealId?: string;
  stage?: DealStage;
  note?: string;
  interactionType?: InteractionType;
  sentiment?: Sentiment;
  priority?: number;
  urgency?: NextBestAction["urgency"];
  actionType?: NextBestActionType;
  subject?: string;
  body?: string;
  description?: string;
  category?: string;
  route?: string;
};

export type AppliedAction = {
  label: string;
  applied: boolean;
  undo?: () => void;
  navigateTo?: string;
  payload?: Record<string, unknown>;
};

export function applyAgentAction(a: AgentAction): AppliedAction {
  try {
    if (a.type === "update_deal_stage" && a.dealId && a.stage) {
      const deals = readDeals();
      const idx = deals.findIndex((d) => d.id === a.dealId);
      if (idx < 0) return { label: a.label, applied: false };
      const prev = deals[idx];
      const next: Deal = { ...prev, stage: a.stage };
      next.healthScore = calculateHealthScore(next, prev.healthScore?.score, prev.healthScore?.history);
      const newDeals = [...deals];
      newDeals[idx] = next;
      writeDeals(newDeals);
      return {
        label: a.label,
        applied: true,
        undo: () => {
          const cur = readDeals();
          writeDeals(cur.map((d) => (d.id === prev.id ? prev : d)));
        },
      };
    }

    if (a.type === "add_deal_interaction" && a.dealId && a.note) {
      const deals = readDeals();
      const idx = deals.findIndex((d) => d.id === a.dealId);
      if (idx < 0) return { label: a.label, applied: false };
      const prev = deals[idx];
      const interaction: Interaction = {
        id: uid(),
        type: (a.interactionType ?? "follow_up") as InteractionType,
        date: new Date().toISOString(),
        notes: a.note,
        sentiment: (a.sentiment ?? "neutral") as Sentiment,
        conductedBy: "Me (AI)",
      };
      const updated: Deal = {
        ...prev,
        interactions: [...prev.interactions, interaction],
        lastContactDate: interaction.date,
      };
      updated.healthScore = calculateHealthScore(updated, prev.healthScore?.score, prev.healthScore?.history);
      const newDeals = [...deals];
      newDeals[idx] = updated;
      writeDeals(newDeals);
      return {
        label: a.label,
        applied: true,
        undo: () => writeDeals(readDeals().map((d) => (d.id === prev.id ? prev : d))),
      };
    }

    if (a.type === "create_next_best_action" && a.dealId && a.note) {
      const deals = readDeals();
      const idx = deals.findIndex((d) => d.id === a.dealId);
      if (idx < 0) return { label: a.label, applied: false };
      const prev = deals[idx];
      const nba: NextBestAction = {
        id: uid(),
        priority: ((a.priority ?? 2) as 1 | 2 | 3),
        action: a.note,
        reasoning: "Suggested by DeskIQ Copilot",
        actionType: (a.actionType ?? "call") as NextBestActionType,
        urgency: (a.urgency ?? "this_week") as NextBestAction["urgency"],
        estimatedImpact: "medium",
        completed: false,
      };
      const updated: Deal = { ...prev, nextBestActions: [...(prev.nextBestActions ?? []), nba] };
      const newDeals = [...deals];
      newDeals[idx] = updated;
      writeDeals(newDeals);
      return {
        label: a.label,
        applied: true,
        undo: () => writeDeals(readDeals().map((d) => (d.id === prev.id ? prev : d))),
      };
    }

    if (a.type === "draft_email") {
      return {
        label: a.label,
        applied: true,
        payload: { subject: a.subject ?? "", body: a.body ?? "" },
      };
    }

    if (a.type === "start_timer" && a.description) {
      const timer = {
        isRunning: true,
        isPaused: false,
        startTime: new Date().toISOString(),
        pausedAt: null,
        accumulatedSec: 0,
        currentDescription: a.description,
        category: a.category,
      };
      localStorage.setItem("deskiq_timer_state", JSON.stringify(timer));
      window.dispatchEvent(new CustomEvent("deskiq:time-updated"));
      return { label: a.label, applied: true, navigateTo: "/time" };
    }

    if (a.type === "open_route" && a.route) {
      return { label: a.label, applied: true, navigateTo: a.route };
    }
  } catch (e) {
    console.error("applyAgentAction failed", e);
  }
  return { label: a.label, applied: false };
}

/** Build a compact data snapshot to send to the agent — just enough to be useful. */
export function buildDataSnapshot(): string {
  if (typeof window === "undefined") return "";
  try {
    const deals = readDeals();
    const open = deals
      .filter((d) => d.stage !== "Closed Won" && d.stage !== "Closed Lost")
      .slice(0, 12)
      .map((d) => ({
        id: d.id,
        client: d.clientCompany,
        title: d.title,
        stage: d.stage,
        value: d.dealValue,
        health: d.healthScore?.score ?? null,
        close: d.expectedCloseDate.slice(0, 10),
        lastContact: d.lastContactDate.slice(0, 10),
        openActions: (d.nextBestActions ?? []).filter((a) => !a.completed).length,
      }));
    const proposalsRaw = localStorage.getItem("deskiq_proposals");
    const proposals = proposalsRaw
      ? (JSON.parse(proposalsRaw) as Array<{ id: string; clientCompany: string; title: string; status: string }>)
          .slice(0, 8)
          .map((p) => ({ id: p.id, client: p.clientCompany, title: p.title, status: p.status }))
      : [];
    return JSON.stringify({ deals: open, proposals }, null, 0).slice(0, 18000);
  } catch {
    return "";
  }
}
