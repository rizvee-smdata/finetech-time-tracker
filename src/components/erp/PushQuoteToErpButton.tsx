import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Receipt } from "lucide-react";
import { toast } from "sonner";
import { listErpConnections, pushQuoteToErp } from "@/lib/erp/erp.functions";
import type { ErpConnection } from "@/lib/erp/types";

/** Pushes an accepted quote into the company's active accounting connection as a draft invoice. */
export function PushQuoteToErpButton({ quoteId, companyId }: { quoteId: string; companyId: string }) {
  const list = useServerFn(listErpConnections);
  const push = useServerFn(pushQuoteToErp);
  const [busy, setBusy] = useState(false);

  const { data: connections = [] } = useQuery({
    queryKey: ["erp-connections", companyId],
    queryFn: () => list({ data: { companyId } }) as Promise<ErpConnection[]>,
    staleTime: 60_000,
  });

  const active = connections.find((c) => c.is_active);
  if (!active) return null;

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = (await push({ data: { connectionId: active.id, quoteId } })) as { ok: boolean; message: string };
          r.ok ? toast.success(r.message) : toast.error(r.message);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Push failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Receipt className="size-4" /> To {active.name}
    </Button>
  );
}
