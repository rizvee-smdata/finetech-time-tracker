/**
 * Offline outbox backed by IndexedDB.
 * Field users can capture check-ins, notes and task updates with no connectivity;
 * everything is replayed in order once the device is back online.
 */

export type OutboxKind = "visit_checkin" | "visit_checkout" | "lead_note" | "task_update";

export type OutboxItem = {
  id: string;
  kind: OutboxKind;
  payload: Record<string, any>;
  /** Binary captures (selfie / voice note) kept as Blobs — IndexedDB stores them natively. */
  media?: { field: string; blob: Blob; ext: string }[];
  createdAt: number;
  attempts: number;
  lastError?: string;
};

const DB_NAME = "lavisho-offline";
const STORE = "outbox";
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function subscribeOutbox(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueue(
  kind: OutboxKind,
  payload: Record<string, any>,
  media?: { field: string; blob: Blob; ext: string }[],
): Promise<OutboxItem> {
  const item: OutboxItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    payload,
    media,
    createdAt: Date.now(),
    attempts: 0,
  };
  await tx("readwrite", (s) => s.put(item));
  notify();
  return item;
}

export async function listOutbox(): Promise<OutboxItem[]> {
  try {
    const rows = await tx<OutboxItem[]>("readonly", (s) => s.getAll() as IDBRequest<OutboxItem[]>);
    return (rows ?? []).sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export async function removeItem(id: string) {
  await tx("readwrite", (s) => s.delete(id));
  notify();
}

export async function markFailed(item: OutboxItem, message: string) {
  await tx("readwrite", (s) => s.put({ ...item, attempts: item.attempts + 1, lastError: message }));
  notify();
}

export async function clearOutbox() {
  await tx("readwrite", (s) => s.clear());
  notify();
}

export type OutboxHandler = (item: OutboxItem) => Promise<void>;
const handlers = new Map<OutboxKind, OutboxHandler>();

export function registerOutboxHandler(kind: OutboxKind, handler: OutboxHandler) {
  handlers.set(kind, handler);
}

let flushing = false;

/** After this many failed replays an item stops auto-retrying and waits for a manual retry. */
export const MAX_AUTO_ATTEMPTS = 5;

export function isStuck(item: OutboxItem) {
  return item.attempts >= MAX_AUTO_ATTEMPTS;
}

/** Clear the error/attempt counter so a stuck item is retried on the next sync. */
export async function retryItem(id: string) {
  const rows = await listOutbox();
  const item = rows.find((r) => r.id === id);
  if (!item) return;
  await tx("readwrite", (s) => s.put({ ...item, attempts: 0, lastError: undefined }));
  notify();
}

export async function retryAllStuck() {
  const rows = await listOutbox();
  for (const item of rows.filter(isStuck)) {
    await tx("readwrite", (s) => s.put({ ...item, attempts: 0, lastError: undefined }));
  }
  notify();
}

/** Replay queued items oldest-first. Stops at the first network failure so order is preserved. */
export async function flushOutbox(): Promise<{ sent: number; failed: number; skipped: number }> {
  if (flushing || typeof navigator === "undefined" || !navigator.onLine) return { sent: 0, failed: 0, skipped: 0 };
  flushing = true;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  try {
    for (const item of await listOutbox()) {
      const handler = handlers.get(item.kind);
      // Never silently discard captured field data: stuck items stay in the outbox
      // until the user retries or discards them explicitly.
      if (!handler || isStuck(item)) {
        skipped++;
        continue;
      }
      try {
        await handler(item);
        await removeItem(item.id);
        sent++;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Sync failed";
        await markFailed(item, message);
        failed++;
        // Give up on this pass if the device dropped offline mid-flush.
        if (!navigator.onLine) break;
      }
    }
  } finally {
    flushing = false;
    notify();
  }
  return { sent, failed, skipped };
}
