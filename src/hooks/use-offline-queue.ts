import { useCallback, useEffect, useState } from "react";
import { flushOutbox, listOutbox, subscribeOutbox, type OutboxItem } from "@/lib/offline/queue";
import { registerOfflineHandlers } from "@/lib/offline/handlers";

/** Tracks connectivity plus the pending offline outbox, and auto-syncs when the device reconnects. */
export function useOfflineQueue() {
  const [online, setOnline] = useState(true);
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    setItems(await listOutbox());
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      return await flushOutbox();
    } finally {
      setSyncing(false);
      await refresh();
    }
  }, [refresh]);

  useEffect(() => {
    registerOfflineHandlers();
    setOnline(navigator.onLine);
    void refresh();

    const unsubscribe = subscribeOutbox(() => void refresh());
    const goOnline = () => {
      setOnline(true);
      void sync();
    };
    const goOffline = () => setOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const timer = window.setInterval(() => {
      if (navigator.onLine) void sync();
    }, 60_000);

    if (navigator.onLine) void sync();

    return () => {
      unsubscribe();
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { online, pending: items.length, items, syncing, sync, refresh };
}
