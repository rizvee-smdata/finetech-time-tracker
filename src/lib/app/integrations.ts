// Cross-module integration helpers — pure functions that read/write the
// existing module localStorage stores so any UI surface stays in sync.
//
// These intentionally do NOT use React hooks so they can be called from
// event handlers, timer stops, or status changes in any module.

import { calculateHealthScore } from "@/lib/deals/scoring";
import type {
  Deal,
  DealStage,
  Interaction,
  InteractionType,
  Sentiment,
} from "@/lib/deals/types";
import type { Meeting } from "@/lib/meetings/types";
import type { Proposal, ProposalStatus } from "@/lib/proposals/types";
import { pushNotification } from "./notifications";
import { getSettings } from "./settings";

const DEALS_KEY = "deskiq_deals";

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
  if (typeof window === "undefined") return;
  localStorage.setItem(DEALS_KEY, JSON.stringify(d));
  // Notify the deals store listeners. We rebroadcast via a Storage event
  // surrogate by dispatching a CustomEvent the deals store can also listen for.
  window.dispatchEvent(new CustomEvent("deskiq:deals-updated"));
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

function healthEmoji(status: string) {
  return status === "healthy" ? "🟢" : status === "at_risk" ? "🟡" : "🔴";
}

function inferInteractionType(title: string): InteractionType {
  const t = title.toLowerCase();
  if (t.includes("demo")) return "demo";
  if (t.includes("call")) return "call";
  if (t.includes("email")) return "email";
  if (t.includes("proposal")) return "proposal_sent";
  if (t.includes("follow")) return "follow_up";
  return "meeting";
}

/** Result of a deal recalculation, useful for toast messages. */
export type RecalcResult = {
  deal: Deal;
  prevScore: number;
  newScore: number;
  improved: boolean;
  declined: boolean;
};

function recalcDeal(deal: Deal): RecalcResult {
  const prevScore = deal.healthScore?.score ?? 0;
  const next = {
    ...deal,
    healthScore: calculateHealthScore(deal, prevScore, deal.healthScore?.history),
  };
  return {
    deal: next,
    prevScore,
    newScore: next.healthScore!.score,
    improved: next.healthScore!.score > prevScore,
    declined: next.healthScore!.score < prevScore,
  };
}

// ── INTEGRATION 1: Meeting → Deal Health ────────────────────────────────────
export function linkMeetingToDeal(meeting: Meeting, dealId: string) {
  const deals = readDeals();
  const idx = deals.findIndex((d) => d.id === dealId);
  if (idx < 0) return null;
  const target = deals[idx];
  const interaction: Interaction = {
    id: uid(),
    type: inferInteractionType(meeting.title),
    date: meeting.date,
    notes: meeting.processed?.summary ?? meeting.rawNotes.slice(0, 280),
    sentiment: (meeting.processed?.sentimentScore as Sentiment) ?? "neutral",
    conductedBy: meeting.attendees[0] ?? "Me",
  };
  const updated: Deal = {
    ...target,
    interactions: [...target.interactions, interaction],
    lastContactDate: interaction.date,
  };
  const result = recalcDeal(updated);
  deals[idx] = result.deal;
  writeDeals(deals);

  pushNotification({
    category: "update",
    source: "meeting",
    title: `Meeting linked to ${target.clientCompany}`,
    description: `Deal health ${result.prevScore} → ${result.newScore} ${healthEmoji(result.deal.healthScore!.status)}`,
    link: { to: "/deals/$dealId", params: { dealId } },
    actionLabel: "Open deal",
  });
  return result;
}

// ── INTEGRATION 4: Time → Deal Health ───────────────────────────────────────
export function logTimeAgainstDeal(args: {
  dealId: string;
  minutes: number;
  description: string;
  category?: string;
}) {
  const deals = readDeals();
  const idx = deals.findIndex((d) => d.id === args.dealId);
  if (idx < 0) return null;
  const target = deals[idx];
  const interaction: Interaction = {
    id: uid(),
    type: "follow_up",
    date: new Date().toISOString(),
    notes: `Logged ${args.minutes}m — ${args.description}${args.category ? ` (${args.category})` : ""}`,
    sentiment: "neutral",
    conductedBy: "Me",
  };
  const updated: Deal = {
    ...target,
    interactions: [...target.interactions, interaction],
    lastContactDate: interaction.date,
  };
  const result = recalcDeal(updated);
  deals[idx] = result.deal;
  writeDeals(deals);

  // Budget check
  const prefs = getSettings().notifications;
  try {
    const raw = localStorage.getItem("deskiq_project_budgets");
    const budgets = raw ? (JSON.parse(raw) as Array<{ dealId: string; budgetedHours: number; warningThreshold: number }>) : [];
    const b = budgets.find((x) => x.dealId === args.dealId);
    if (b) {
      const entriesRaw = localStorage.getItem("deskiq_timeentries");
      const entries = entriesRaw ? (JSON.parse(entriesRaw) as Array<{ dealId?: string; duration: number }>) : [];
      const totalMin = entries.filter((e) => e.dealId === args.dealId).reduce((a, e) => a + e.duration, 0);
      const pct = (totalMin / 60 / Math.max(1, b.budgetedHours)) * 100;
      const threshold = Math.min(b.warningThreshold ?? prefs.budgetThresholdPct, prefs.budgetThresholdPct);
      if (pct >= threshold) {
        pushNotification({
          category: "urgent",
          source: "time",
          title: `Budget warning · ${target.clientCompany}`,
          description: `${Math.round(pct)}% of ${b.budgetedHours}h budget consumed`,
          link: { to: "/time" },
          actionLabel: "Open tracker",
        });
      }
    }
  } catch {
    // ignore
  }

  pushNotification({
    category: "update",
    source: "time",
    title: `Time logged · ${target.clientCompany}`,
    description: `${args.minutes}m → deal health ${result.prevScore} → ${result.newScore}`,
    link: { to: "/deals/$dealId", params: { dealId: args.dealId } },
  });
  return result;
}

// ── INTEGRATION 5: Proposal status → Deal stage ─────────────────────────────
export function syncProposalToDeal(proposal: Proposal, newStatus: ProposalStatus) {
  if (!proposal.dealId) return null;
  const deals = readDeals();
  const idx = deals.findIndex((d) => d.id === proposal.dealId);
  if (idx < 0) return null;
  const target = deals[idx];
  let newStage: DealStage = target.stage;
  let lossReason = target.lossReason;
  if (newStatus === "sent" && target.stage !== "Negotiation" && target.stage !== "Closed Won" && target.stage !== "Closed Lost") {
    newStage = "Proposal";
  } else if (newStatus === "accepted") {
    newStage = "Closed Won";
  } else if (newStatus === "rejected") {
    newStage = "Closed Lost";
    lossReason = lossReason ?? "Proposal rejected";
  }
  const updated: Deal = {
    ...target,
    stage: newStage,
    lossReason,
    interactions: [
      ...target.interactions,
      {
        id: uid(),
        type: "proposal_sent",
        date: new Date().toISOString(),
        notes: `Proposal "${proposal.title}" marked ${newStatus}`,
        sentiment: newStatus === "accepted" ? "positive" : newStatus === "rejected" ? "negative" : "neutral",
        conductedBy: "Me",
      },
    ],
    lastContactDate: new Date().toISOString(),
  };
  const result = recalcDeal(updated);
  deals[idx] = result.deal;
  writeDeals(deals);

  if (newStatus === "accepted") {
    pushNotification({
      category: "win",
      source: "proposal",
      title: `🎉 Deal won · ${target.clientCompany}`,
      description: `${proposal.title} accepted — stage moved to Closed Won`,
      link: { to: "/deals/$dealId", params: { dealId: target.id } },
    });
  } else if (newStatus === "rejected") {
    pushNotification({
      category: "urgent",
      source: "proposal",
      title: `Proposal rejected · ${target.clientCompany}`,
      description: `${proposal.title} — deal moved to Closed Lost`,
      link: { to: "/deals/$dealId", params: { dealId: target.id } },
    });
  } else {
    pushNotification({
      category: "update",
      source: "proposal",
      title: `Proposal sent · ${target.clientCompany}`,
      description: `Deal stage advanced to Proposal`,
      link: { to: "/deals/$dealId", params: { dealId: target.id } },
    });
  }
  return result;
}

// ── Action completion ───────────────────────────────────────────────────────
export function notifyActionCompleted(dealLabel: string, actionText: string) {
  pushNotification({
    category: "win",
    source: "deal",
    title: `Action completed`,
    description: `${actionText} · ${dealLabel}`,
  });
}
