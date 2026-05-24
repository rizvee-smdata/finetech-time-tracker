import { useCallback, useEffect, useState } from "react";
import type { Notification } from "./types";

const KEY = "deskiq_notifications";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

function read(): Notification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Notification[]) : [];
  } catch {
    return [];
  }
}

function write(list: Notification[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 200)));
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function pushNotification(n: Omit<Notification, "id" | "createdAt" | "read">) {
  const full: Notification = {
    ...n,
    id: uid(),
    createdAt: new Date().toISOString(),
    read: false,
  };
  write([full, ...read()]);
  notify();
  return full;
}

export function useNotifications() {
  const [items, setItems] = useState<Notification[]>([]);
  useEffect(() => {
    setItems(read());
    const l = () => setItems(read());
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const markRead = useCallback((id: string) => {
    write(read().map((n) => (n.id === id ? { ...n, read: true } : n)));
    notify();
  }, []);
  const markAllRead = useCallback(() => {
    write(read().map((n) => ({ ...n, read: true })));
    notify();
  }, []);
  const dismiss = useCallback((id: string) => {
    write(read().filter((n) => n.id !== id));
    notify();
  }, []);
  const clearAll = useCallback(() => {
    write([]);
    notify();
  }, []);

  return { items, unreadCount: items.filter((n) => !n.read).length, markRead, markAllRead, dismiss, clearAll };
}
