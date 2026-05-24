import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SETTINGS, type AppSettings } from "./types";

const KEY = "deskiq_settings";

function read(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed } as AppSettings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function write(s: AppSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  useEffect(() => {
    setSettings(read());
    const l = () => setSettings(read());
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const update = useCallback((patch: Partial<AppSettings>) => {
    const next = { ...read(), ...patch } as AppSettings;
    write(next);
    notify();
  }, []);
  const reset = useCallback(() => {
    write(DEFAULT_SETTINGS);
    notify();
  }, []);

  return { settings, update, reset };
}

export function getSettings(): AppSettings {
  return read();
}
