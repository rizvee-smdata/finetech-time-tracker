import { useEffect, useState, useCallback } from "react";
import type { Meeting, ProcessedMeeting, ActionItem } from "./types";

const KEY = "deskiq_meetings";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

function seed(): Meeting[] {
  const now = Date.now();
  const m1: Meeting = {
    id: uid(),
    title: "Core banking modernization — Discovery",
    clientName: "Ahmed Hassan",
    clientCompany: "Jamuna Bank",
    date: new Date(now - 1000 * 60 * 60 * 24 * 2).toISOString(),
    attendees: ["Ahmed Hassan", "Me", "Ridita (Solutions)"],
    rawNotes:
      "Client wants to modernize core banking. Pain: legacy COBOL integration is slow, batch-only. Want real-time APIs. Budget approved for FY24. Ahmed will share architecture diagrams Friday. Need POC in 6 weeks. Decision by end of Q2. Competitor mentioned: Infosys Finacle.",
    status: "processed",
    createdAt: new Date(now - 1000 * 60 * 60 * 24 * 2).toISOString(),
    processed: {
      summary:
        "Jamuna Bank is committed to modernizing their core banking stack, with budget already approved for FY24. The main blocker is their legacy COBOL system which only supports batch integrations. They want a 6-week POC and have a Q2 decision deadline. Infosys Finacle is in the running.",
      sentimentScore: "positive",
      dealStage: "Proposal",
      painPoints: [
        "Legacy COBOL core only supports batch integrations — no real-time APIs",
        "Slow turnaround on new integration requests is delaying digital initiatives",
      ],
      objections: ["Infosys Finacle is being evaluated in parallel"],
      nextSteps: [
        "Receive architecture diagrams from Ahmed by Friday",
        "Scope a 6-week POC proposal",
        "Schedule technical deep-dive with their core banking team",
      ],
      actionItems: [
        { id: uid(), task: "Send POC scope document", owner: "Me", deadline: "3 business days", priority: "high", done: false },
        { id: uid(), task: "Follow up on architecture diagrams", owner: "Me", deadline: "Friday", priority: "high", done: false },
        { id: uid(), task: "Prepare competitive comparison vs Finacle", owner: "Ridita", deadline: "1 week", priority: "medium", done: true },
        { id: uid(), task: "Book technical deep-dive call", owner: "Me", deadline: "Next Tuesday", priority: "medium", done: false },
      ],
      crmUpdates: [
        { field: "Deal Stage", suggestedValue: "Proposal", accepted: false },
        { field: "Deal Value", suggestedValue: "$250,000 (POC + Phase 1)", accepted: false },
        { field: "Competitor", suggestedValue: "Infosys Finacle", accepted: false },
        { field: "Close Date", suggestedValue: "End of Q2", accepted: false },
      ],
      followUpSubject: "Jamuna Bank — POC scope & next steps",
      followUpEmail: `Hi Ahmed,

Thank you for the productive conversation today. Quick recap of where we landed:

• You're targeting a 6-week POC with a Q2 decision
• Real-time API enablement on top of the existing core is the primary success criterion
• You'll share the current architecture diagrams by Friday

On our side, I'll send the POC scope document within 3 business days and book a technical deep-dive with your core banking team for next week.

Please let me know if I've missed anything.

Best regards,`,
    },
  };

  const m2: Meeting = {
    id: uid(),
    title: "ERP renewal — Discovery call",
    clientName: "Tanvir Rahman",
    clientCompany: "Square Pharmaceuticals",
    date: new Date(now - 1000 * 60 * 60 * 24 * 5).toISOString(),
    attendees: ["Tanvir Rahman", "Me"],
    rawNotes:
      "Current ERP up for renewal Dec. Tanvir not sure if they need full upgrade or just modules. Concerned about cost vs ROI. Wants to see pricing tiers. Asked for case study from another pharma. Will loop in CFO next call.",
    status: "processed",
    createdAt: new Date(now - 1000 * 60 * 60 * 24 * 5).toISOString(),
    processed: {
      summary:
        "Square Pharmaceuticals is approaching ERP renewal in December and is undecided between a full upgrade and a modular path. Cost vs. ROI is the primary concern. Tanvir asked for tiered pricing and a pharma case study before the next call, which will include their CFO.",
      sentimentScore: "neutral",
      dealStage: "Discovery",
      painPoints: [
        "Unclear whether a full upgrade or modular renewal fits better",
        "Internal pressure to justify ROI before committing budget",
      ],
      objections: ["Budget sensitivity — needs CFO buy-in"],
      nextSteps: [
        "Share tiered pricing options",
        "Send pharma sector case study",
        "Schedule follow-up with CFO included",
      ],
      actionItems: [
        { id: uid(), task: "Send 3-tier pricing breakdown", owner: "Me", deadline: "2 business days", priority: "high", done: false },
        { id: uid(), task: "Share pharma reference case study", owner: "Me", deadline: "2 business days", priority: "medium", done: false },
        { id: uid(), task: "Schedule CFO-included call", owner: "Me", deadline: "Next week", priority: "high", done: false },
      ],
      crmUpdates: [
        { field: "Deal Stage", suggestedValue: "Discovery", accepted: false },
        { field: "Renewal Date", suggestedValue: "December", accepted: false },
        { field: "Decision Maker", suggestedValue: "CFO (to be looped in)", accepted: false },
      ],
      followUpSubject: "Square Pharma — pricing options & next call",
      followUpEmail: `Hi Tanvir,

Thanks for the candid conversation about the upcoming renewal. As discussed, I'll send over:

1. A 3-tier pricing breakdown so you can compare a modular renewal vs. a full upgrade
2. A pharma reference case study highlighting ROI in year one

Once you've had a chance to review with your CFO, let's get a follow-up on the calendar — happy to walk through any of it live.

Best regards,`,
    },
  };

  return [m1, m2];
}

function readStore(): Meeting[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const s = seed();
      localStorage.setItem(KEY, JSON.stringify(s));
      return s;
    }
    return JSON.parse(raw) as Meeting[];
  } catch {
    return [];
  }
}

function writeStore(m: Meeting[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(m));
}

// Pub/sub so multiple components stay in sync
const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}

export function useMeetingsStore() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);

  useEffect(() => {
    setMeetings(readStore());
    const listener = () => setMeetings(readStore());
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const persist = useCallback((next: Meeting[]) => {
    writeStore(next);
    notify();
  }, []);

  const addMeeting = useCallback(
    (m: Omit<Meeting, "id" | "createdAt">) => {
      const meeting: Meeting = { ...m, id: uid(), createdAt: new Date().toISOString() };
      const next = [meeting, ...readStore()];
      persist(next);
      return meeting;
    },
    [persist],
  );

  const updateMeeting = useCallback(
    (id: string, patch: Partial<Meeting>) => {
      const next = readStore().map((m) => (m.id === id ? { ...m, ...patch } : m));
      persist(next);
    },
    [persist],
  );

  const setProcessed = useCallback(
    (id: string, processed: ProcessedMeeting) => {
      const withIds: ProcessedMeeting = {
        ...processed,
        actionItems: processed.actionItems.map((a) => ({
          ...a,
          id: a.id || uid(),
          done: a.done ?? false,
        })),
        crmUpdates: processed.crmUpdates.map((c) => ({ ...c, accepted: c.accepted ?? false })),
      };
      const next = readStore().map((m) =>
        m.id === id ? { ...m, processed: withIds, status: "processed" as const } : m,
      );
      persist(next);
    },
    [persist],
  );

  const toggleActionItem = useCallback(
    (meetingId: string, itemId: string) => {
      const next = readStore().map((m) => {
        if (m.id !== meetingId || !m.processed) return m;
        return {
          ...m,
          processed: {
            ...m.processed,
            actionItems: m.processed.actionItems.map((a) =>
              a.id === itemId ? { ...a, done: !a.done } : a,
            ),
          },
        };
      });
      persist(next);
    },
    [persist],
  );

  const updateActionItem = useCallback(
    (meetingId: string, itemId: string, patch: Partial<ActionItem>) => {
      const next = readStore().map((m) => {
        if (m.id !== meetingId || !m.processed) return m;
        return {
          ...m,
          processed: {
            ...m.processed,
            actionItems: m.processed.actionItems.map((a) =>
              a.id === itemId ? { ...a, ...patch } : a,
            ),
          },
        };
      });
      persist(next);
    },
    [persist],
  );

  const setProcessedField = useCallback(
    <K extends keyof ProcessedMeeting>(
      meetingId: string,
      field: K,
      value: ProcessedMeeting[K],
    ) => {
      const next = readStore().map((m) => {
        if (m.id !== meetingId || !m.processed) return m;
        return { ...m, processed: { ...m.processed, [field]: value } };
      });
      persist(next);
    },
    [persist],
  );

  const toggleCrmUpdate = useCallback(
    (meetingId: string, idx: number) => {
      const next = readStore().map((m) => {
        if (m.id !== meetingId || !m.processed) return m;
        return {
          ...m,
          processed: {
            ...m.processed,
            crmUpdates: m.processed.crmUpdates.map((c, i) =>
              i === idx ? { ...c, accepted: !c.accepted } : c,
            ),
          },
        };
      });
      persist(next);
    },
    [persist],
  );

  const deleteMeeting = useCallback(
    (id: string) => {
      persist(readStore().filter((m) => m.id !== id));
    },
    [persist],
  );

  return {
    meetings,
    addMeeting,
    updateMeeting,
    setProcessed,
    toggleActionItem,
    updateActionItem,
    setProcessedField,
    toggleCrmUpdate,
    deleteMeeting,
  };
}
