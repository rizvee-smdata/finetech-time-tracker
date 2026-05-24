import { useEffect, useState, useCallback, useMemo } from "react";
import type { Deal, Interaction, NextBestAction, AIDealAnalysis } from "./types";
import { calculateHealthScore } from "./scoring";
import { useAuth } from "@/hooks/use-auth";

const BASE_KEY = "deskiq_deals";
const keyFor = (companyId: string | null | undefined) =>
  companyId ? `${BASE_KEY}::${companyId}` : `${BASE_KEY}::__none__`;


const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

function withHealth(deal: Deal): Deal {
  const prev = deal.healthScore?.score;
  const history = deal.healthScore?.history;
  return { ...deal, healthScore: calculateHealthScore(deal, prev, history) };
}

function readStore(key: string): Deal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as Deal[];
    localStorage.setItem(key, "[]");
    return [];
  } catch {
    return [];
  }
}


function writeStore(key: string, d: Deal[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(d));
}


const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}

export function useDealsStore() {
  const { companyId } = useAuth();
  const key = useMemo(() => keyFor(companyId), [companyId]);
  const [deals, setDeals] = useState<Deal[]>([]);

  useEffect(() => {
    setDeals(readStore(key));
    const l = () => setDeals(readStore(key));
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
  }, [key]);


  const persist = useCallback((next: Deal[]) => {
    writeStore(key, next);
    notify();
  }, [key]);

  const recalculate = useCallback(
    (id: string) => {
      const next = readStore(key).map((d) => (d.id === id ? withHealth(d) : d));
      persist(next);
    },
    [persist, key],
  );

  const recalculateAll = useCallback(() => {
    const next = readStore(key).map(withHealth);
    persist(next);
  }, [persist, key]);

  const addInteraction = useCallback(
    (dealId: string, input: Omit<Interaction, "id">) => {
      const interaction: Interaction = { ...input, id: uid() };
      const next = readStore(key).map((d) => {
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
    [persist, key],
  );

  const setAIAnalysis = useCallback(
    (dealId: string, analysis: AIDealAnalysis, actions: NextBestAction[]) => {
      const next = readStore(key).map((d) =>
        d.id === dealId ? { ...d, aiAnalysis: analysis, nextBestActions: actions } : d,
      );
      persist(next);
    },
    [persist, key],
  );

  const toggleAction = useCallback(
    (dealId: string, actionId: string) => {
      const next = readStore(key).map((d) => {
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
    [persist, key],
  );

  const updateActionDraft = useCallback(
    (dealId: string, actionId: string, draftContent: string) => {
      const next = readStore(key).map((d) => {
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
    [persist, key],
  );

  const updateDeal = useCallback(
    (id: string, patch: Partial<Deal>) => {
      const next = readStore(key).map((d) => (d.id === id ? withHealth({ ...d, ...patch }) : d));
      persist(next);
    },
    [persist, key],
  );

  const deleteDeal = useCallback(
    (id: string) => {
      persist(readStore(key).filter((d) => d.id !== id));
    },
    [persist, key],
  );

  const resetSeed = useCallback(() => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(key);
    persist([]);
  }, [persist, key]);

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
