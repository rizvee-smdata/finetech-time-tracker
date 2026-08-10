import { useOfflineQueue } from "@/hooks/use-offline-queue";
import { Button } from "@/components/ui/button";
import { isStuck, retryAllStuck, removeItem } from "@/lib/offline/queue";
import { AlertTriangle, CloudOff, RefreshCw, WifiOff } from "lucide-react";
import { toast } from "sonner";

/** Compact status strip: shows offline mode, anything waiting to sync, and items that need attention. */
export function OfflineStatusBar() {
  const { online, pending, items, syncing, sync } = useOfflineQueue();

  const stuck = items.filter(isStuck);

  if (online && pending === 0) return null;

  const waiting = pending - stuck.length;

  return (
    <div className="space-y-1">
      {(waiting > 0 || !online) && (
        <div className="flex items-center gap-2 border-b border-border bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          {online ? <CloudOff className="h-4 w-4 shrink-0" /> : <WifiOff className="h-4 w-4 shrink-0" />}
          <span className="flex-1">
            {online
              ? `${waiting} item${waiting === 1 ? "" : "s"} waiting to sync.`
              : `Offline — you can keep working${waiting ? `, ${waiting} item${waiting === 1 ? "" : "s"} queued` : ""}.`}
          </span>
          {online && waiting > 0 && (
            <Button size="sm" variant="outline" className="h-7" disabled={syncing} onClick={() => void sync()}>
              <RefreshCw className={`mr-1 h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
              Sync now
            </Button>
          )}
        </div>
      )}

      {stuck.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1 min-w-[12rem]">
            {stuck.length} item{stuck.length === 1 ? "" : "s"} couldn&apos;t sync
            {stuck[0]?.lastError ? ` — ${stuck[0].lastError}` : ""}. Nothing was lost.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={syncing || !online}
            onClick={async () => {
              await retryAllStuck();
              await sync();
            }}
          >
            <RefreshCw className={`mr-1 h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
            Retry
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={async () => {
              for (const item of stuck) await removeItem(item.id);
              toast.success("Discarded items that could not sync");
            }}
          >
            Discard
          </Button>
        </div>
      )}
    </div>
  );
}
