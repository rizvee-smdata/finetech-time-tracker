import { useEffect, useState, useCallback } from "react";
import type { Deal, Interaction, NextBestAction, AIDealAnalysis } from "./types";
import { calculateHealthScore } from "./scoring";
import { seedDeals } from "./seed";

const KEY = "deskiq_deals";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

function withHealth(deal: Deal): Deal {
  const prev = deal.healthScore?.score;
  const history = deal.healthScore?.history;
  return { ...deal, healthScore: calculateHealthScore(deal, prev, history) };
}

function readStore(): Deal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const seeded = seedDeals().map(withHealth);
      localStorage.setItem(KEY, JSON.stringify(seeded));
      return seeded;
    }
    return JSON.parse(raw) as Deal[];
  } catch {
    return [];
  }
}

function writeStore(d: Deal[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(d));
}

const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}

export function useDealsStore() {
  const [deals, setDeals] = useState<Deal[]>([]);

  useEffect(() => {
    setDeals(readStore());
    const l = () => setDeals(readStore());
    listeners.add(l);
    if (typeof window !== "undefined") {
      window.addEventListener("deskiq:deals-updated", l);
    }
    return () => {
      listeners.delete(l);
      if (typeof window !== "undefined") {
        window.removeEventListener("deskiq:deals-updated", l);
      }
    };
  }, []);


  const persist = useCallback((next: Deal[]) => {
    writeStore(next);
    notify();
  }, []);

  const recalculate = useCallback(
    (id: string) => {
      const next = readStore().map((d) => (d.id === id ? withHealth(d) : d));
      persist(next);
    },
    [persist],
  );

  const recalculateAll = useCallback(() => {
    const next = readStore().map(withHealth);
    persist(next);
  }, [persist]);

  const addInteraction = useCallback(
    (dealId: string, input: Omit<Interaction, "id">) => {
      const interaction: Interaction = { ...input, id: uid() };
      const next = readStore().map((d) => {
        if (d.id !== dealId) return d;
        const updated: Deal = {
          ...d,
          interactions: [...d.interactions, interaction],
          lastContactDate: interaction.date,
        };
        return withHealth(updated);
      });
      persist(next);
    },
    [persist],
  );

  const setAIAnalysis = useCallback(
    (dealId: string, analysis: AIDealAnalysis, actions: NextBestAction[]) => {
      const next = readStore().map((d) =>
        d.id === dealId ? { ...d, aiAnalysis: analysis, nextBestActions: actions } : d,
      );
      persist(next);
    },
    [persist],
  );

  const toggleAction = useCallback(
    (dealId: string, actionId: string) => {
      const next = readStore().map((d) => {
        if (d.id !== dealId || !d.nextBestActions) return d;
        return {
          ...d,
          nextBestActions: d.nextBestActions.map((a) =>
            a.id === actionId
              ? {
                  ...a,
                  completed: !a.completed,
                  completedAt: !a.completed ? new Date().toISOString() : undefined,
                }
              : a,
          ),
        };
      });
      persist(next);
    },
    [persist],
  );

  const updateActionDraft = useCallback(
    (dealId: string, actionId: string, draftContent: string) => {
      const next = readStore().map((d) => {
        if (d.id !== dealId || !d.nextBestActions) return d;
        return {
          ...d,
          nextBestActions: d.nextBestActions.map((a) =>
            a.id === actionId ? { ...a, draftContent } : a,
          ),
        };
      });
      persist(next);
    },
    [persist],
  );

  const updateDeal = useCallback(
    (id: string, patch: Partial<Deal>) => {
      const next = readStore().map((d) => (d.id === id ? withHealth({ ...d, ...patch }) : d));
      persist(next);
    },
    [persist],
  );

  const deleteDeal = useCallback(
    (id: string) => {
      persist(readStore().filter((d) => d.id !== id));
    },
    [persist],
  );

  const resetSeed = useCallback(() => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(KEY);
    const seeded = seedDeals().map(withHealth);
    persist(seeded);
  }, [persist]);

  return {
    deals,
    recalculate,
    recalculateAll,
    addInteraction,
    setAIAnalysis,
    toggleAction,
    updateActionDraft,
    updateDeal,
    deleteDeal,
    resetSeed,
  };
}

export function newActionId() {
  return uid();
}
