import { useEffect, useState, useCallback } from "react";
import type { TimeEntry, TimerState, DailyTarget, ProjectBudget } from "./types";
import { DEFAULT_DAILY_TARGET } from "./types";
import { seedTimeEntries, seedBudgets } from "./seed";

const ENTRIES_KEY = "deskiq_timeentries";
const TIMER_KEY = "deskiq_timer_state";
const TARGET_KEY = "deskiq_daily_target";
const BUDGETS_KEY = "deskiq_project_budgets";

export const BRIEFING_KEY = "deskiq_briefing_cache";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

function readSeededDeals(): { id: string; clientName: string; clientCompany: string; title: string }[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("deskiq_deals");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<{
      id: string; clientName: string; clientCompany: string; title: string; stage: string;
    }>;
    return parsed.filter((d) => d.stage !== "Closed Lost").map((d) => ({
      id: d.id, clientName: d.clientName, clientCompany: d.clientCompany, title: d.title,
    }));
  } catch { return []; }
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch { return fallback; }
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

function ensureEntries(): TimeEntry[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(ENTRIES_KEY);
  if (raw) {
    try { return JSON.parse(raw) as TimeEntry[]; } catch { return []; }
  }
  const seeded = seedTimeEntries(readSeededDeals());
  write(ENTRIES_KEY, seeded);
  return seeded;
}

function ensureBudgets(): ProjectBudget[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(BUDGETS_KEY);
  if (raw) {
    try { return JSON.parse(raw) as ProjectBudget[]; } catch { return []; }
  }
  const seeded = seedBudgets(readSeededDeals());
  write(BUDGETS_KEY, seeded);
  return seeded;
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function useTimeStore() {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [target, setTarget] = useState<DailyTarget>(DEFAULT_DAILY_TARGET);
  const [budgets, setBudgets] = useState<ProjectBudget[]>([]);

  const refresh = useCallback(() => {
    setEntries(ensureEntries());
    setTimer(read<TimerState | null>(TIMER_KEY, null));
    setTarget(read<DailyTarget>(TARGET_KEY, DEFAULT_DAILY_TARGET));
    setBudgets(ensureBudgets());
  }, []);

  useEffect(() => {
    refresh();
    listeners.add(refresh);
    return () => { listeners.delete(refresh); };
  }, [refresh]);

  const persistEntries = useCallback((next: TimeEntry[]) => { write(ENTRIES_KEY, next); notify(); }, []);
  const persistTimer = useCallback((next: TimerState | null) => {
    if (next) write(TIMER_KEY, next); else if (typeof window !== "undefined") localStorage.removeItem(TIMER_KEY);
    notify();
  }, []);

  const addEntry = useCallback((entry: Omit<TimeEntry, "id">) => {
    const e: TimeEntry = { ...entry, id: uid() };
    persistEntries([e, ...ensureEntries()]);
    return e;
  }, [persistEntries]);

  const updateEntry = useCallback((id: string, patch: Partial<TimeEntry>) => {
    persistEntries(ensureEntries().map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, [persistEntries]);

  const deleteEntry = useCallback((id: string) => {
    persistEntries(ensureEntries().filter((e) => e.id !== id));
  }, [persistEntries]);

  const startTimer = useCallback((description: string, opts?: Partial<TimerState>) => {
    const next: TimerState = {
      isRunning: true, isPaused: false,
      startTime: new Date().toISOString(),
      pausedAt: null, accumulatedSec: 0,
      currentDescription: description,
      ...opts,
    };
    persistTimer(next);
    return next;
  }, [persistTimer]);

  const pauseTimer = useCallback(() => {
    const t = read<TimerState | null>(TIMER_KEY, null);
    if (!t || !t.isRunning || t.isPaused || !t.startTime) return;
    const acc = t.accumulatedSec + Math.floor((Date.now() - new Date(t.startTime).getTime()) / 1000);
    persistTimer({ ...t, isPaused: true, isRunning: false, pausedAt: new Date().toISOString(), accumulatedSec: acc });
  }, [persistTimer]);

  const resumeTimer = useCallback(() => {
    const t = read<TimerState | null>(TIMER_KEY, null);
    if (!t || !t.isPaused) return;
    persistTimer({ ...t, isPaused: false, isRunning: true, startTime: new Date().toISOString(), pausedAt: null });
  }, [persistTimer]);

  const updateTimerFields = useCallback((patch: Partial<TimerState>) => {
    const t = read<TimerState | null>(TIMER_KEY, null);
    if (!t) return;
    persistTimer({ ...t, ...patch });
  }, [persistTimer]);

  const stopAndSave = useCallback((overrides: {
    category: TimerState["category"];
    billable: boolean;
    dealId?: string;
    clientName?: string;
    clientCompany?: string;
    tags: string[];
  }) => {
    const t = read<TimerState | null>(TIMER_KEY, null);
    if (!t || !t.startTime) return null;
    const elapsedSec = t.isPaused
      ? t.accumulatedSec
      : t.accumulatedSec + Math.floor((Date.now() - new Date(t.startTime).getTime()) / 1000);
    const minutes = Math.max(1, Math.round(elapsedSec / 60));
    const end = new Date();
    const start = new Date(end.getTime() - elapsedSec * 1000);
    const entry: TimeEntry = {
      id: uid(),
      description: t.currentDescription,
      rawDescription: t.currentDescription,
      dealId: overrides.dealId,
      clientName: overrides.clientName,
      clientCompany: overrides.clientCompany,
      category: overrides.category ?? "Admin",
      billable: overrides.billable,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      duration: minutes,
      aiClassified: false,
      tags: overrides.tags,
    };
    persistEntries([entry, ...ensureEntries()]);
    persistTimer(null);
    return entry;
  }, [persistEntries, persistTimer]);

  const discardTimer = useCallback(() => persistTimer(null), [persistTimer]);

  const saveTarget = useCallback((t: DailyTarget) => { write(TARGET_KEY, t); notify(); }, []);
  const saveBudgets = useCallback((b: ProjectBudget[]) => { write(BUDGETS_KEY, b); notify(); }, []);

  return {
    entries, timer, target, budgets,
    addEntry, updateEntry, deleteEntry,
    startTimer, pauseTimer, resumeTimer, updateTimerFields, stopAndSave, discardTimer,
    saveTarget, saveBudgets,
  };
}

export function computeElapsedSec(t: TimerState | null, nowMs: number): number {
  if (!t) return 0;
  if (t.isPaused || !t.isRunning || !t.startTime) return t.accumulatedSec;
  return t.accumulatedSec + Math.floor((nowMs - new Date(t.startTime).getTime()) / 1000);
}

export function formatHMS(sec: number): { h: string; m: string; s: string } {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return { h: String(h).padStart(2, "0"), m: String(m).padStart(2, "0"), s: String(s).padStart(2, "0") };
}
