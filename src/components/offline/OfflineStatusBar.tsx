import { useOfflineQueue } from "@/hooks/use-offline-queue";
import { Button } from "@/components/ui/button";
import { CloudOff, RefreshCw, WifiOff } from "lucide-react";

/** Compact status strip: shows offline mode and anything waiting to sync. */
export function OfflineStatusBar() {
  const { online, pending, syncing, sync } = useOfflineQueue();

  if (online && pending === 0) return null;

  return (
    <div className="flex items-center gap-2 border-b border-border bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
      {online ? <CloudOff className="h-4 w-4 shrink-0" /> : <WifiOff className="h-4 w-4 shrink-0" />}
      <span className="flex-1">
        {online
          ? `${pending} item${pending === 1 ? "" : "s"} waiting to sync.`
          : `Offline — you can keep working${pending ? `, ${pending} item${pending === 1 ? "" : "s"} queued` : ""}.`}
      </span>
      {online && pending > 0 && (
        <Button size="sm" variant="outline" className="h-7" disabled={syncing} onClick={() => void sync()}>
          <RefreshCw className={`mr-1 h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
          Sync now
        </Button>
      )}
    </div>
  );
}
