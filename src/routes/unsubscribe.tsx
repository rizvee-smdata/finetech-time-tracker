import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, MailX, CheckCircle2, AlertCircle } from "lucide-react";

type Status = "loading" | "valid" | "already" | "invalid" | "done" | "error";

export const Route = createFileRoute("/unsubscribe")({
  validateSearch: (s: Record<string, unknown>) => ({ token: typeof s.token === "string" ? s.token : "" }),
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const { token } = useSearch({ from: "/unsubscribe" });
  const [status, setStatus] = useState<Status>("loading");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) { setStatus("invalid"); return; }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return setStatus("invalid");
        if (d.valid === false && d.reason === "already_unsubscribed") return setStatus("already");
        if (d.valid) return setStatus("valid");
        setStatus("invalid");
      })
      .catch(() => setStatus("error"));
  }, [token]);

  async function confirm() {
    setSubmitting(true);
    try {
      const r = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.success) setStatus("done");
      else if (d.reason === "already_unsubscribed") setStatus("already");
      else setStatus("error");
    } catch {
      setStatus("error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full p-8 text-center space-y-4">
        {status === "loading" && (<><Loader2 className="h-10 w-10 mx-auto animate-spin text-muted-foreground" /><p>Validating link…</p></>)}
        {status === "valid" && (<>
          <MailX className="h-10 w-10 mx-auto text-primary" />
          <h1 className="text-xl font-bold">Unsubscribe from emails</h1>
          <p className="text-muted-foreground text-sm">You'll stop receiving messages from us.</p>
          <Button onClick={confirm} disabled={submitting} className="w-full">
            {submitting ? "Processing…" : "Confirm Unsubscribe"}
          </Button>
        </>)}
        {status === "already" && (<><CheckCircle2 className="h-10 w-10 mx-auto text-green-600" /><h1 className="text-xl font-bold">Already unsubscribed</h1><p className="text-muted-foreground text-sm">You won't receive further emails.</p></>)}
        {status === "done" && (<><CheckCircle2 className="h-10 w-10 mx-auto text-green-600" /><h1 className="text-xl font-bold">Unsubscribed</h1><p className="text-muted-foreground text-sm">You've been removed from our email list.</p></>)}
        {status === "invalid" && (<><AlertCircle className="h-10 w-10 mx-auto text-amber-600" /><h1 className="text-xl font-bold">Invalid link</h1><p className="text-muted-foreground text-sm">This unsubscribe link is invalid or expired.</p></>)}
        {status === "error" && (<><AlertCircle className="h-10 w-10 mx-auto text-destructive" /><h1 className="text-xl font-bold">Something went wrong</h1><p className="text-muted-foreground text-sm">Please try again later.</p></>)}
      </Card>
    </div>
  );
}
