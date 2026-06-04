import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSharedQuote, respondToQuote } from "@/lib/portal/portal.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, MessageSquare, FileText, Calendar } from "lucide-react";
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/q/$token")({
  head: ({ params }) => ({
    meta: [
      { title: "Quotation — Lavisho Group" },
      { name: "description", content: "View and respond to your Lavisho Group quotation." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Quotation — Lavisho Group" },
      { property: "og:description", content: "View and respond to your Lavisho Group quotation." },
      { property: "og:url", content: `https://lavisho-log-time.lovable.app/q/${params.token}` },
    ],
    links: [
      { rel: "canonical", href: `https://lavisho-log-time.lovable.app/q/${params.token}` },
    ],
  }),
  component: PortalPage,
});

function PortalPage() {
  const { token } = Route.useParams();
  const fetchQuote = useServerFn(getSharedQuote);
  const respondFn = useServerFn(respondToQuote);

  const q = useQuery({
    queryKey: ["portal", token],
    queryFn: () => fetchQuote({ data: { token } }),
  });

  const respond = useMutation({
    mutationFn: (payload: { decision: "accepted" | "revision_requested"; comment?: string; client_name?: string }) =>
      respondFn({ data: { token, ...payload } }),
    onSuccess: () => { toast.success("Response submitted"); q.refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const [clientName, setClientName] = useState("");
  const [comment, setComment] = useState("");

  if (q.isLoading) return <main className="grid min-h-screen place-items-center text-sm text-muted-foreground">Loading…</main>;
  if (!q.data?.ok) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6">
        <Card className="p-8 text-center">
          <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-3 text-xl font-semibold">Quote unavailable</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This link is invalid or has been revoked.
          </p>
        </Card>
      </main>
    );
  }

  const { quote, items, company, share, lead } = q.data;
  const accepted = share.response === "accepted";
  const revision = share.response === "revision_requested";
  const responded = !!share.response;
  const expired = quote.valid_until && new Date(quote.valid_until) < new Date();

  return (
    <main className="min-h-screen bg-muted/30 py-6">
      <div className="mx-auto max-w-3xl space-y-4 px-4">
        <Card className="overflow-hidden">
          <div className="bg-primary px-6 py-5 text-primary-foreground">
            <div className="text-xs opacity-80">Quotation from</div>
            <div className="text-xl font-semibold">{company?.name ?? "Our Team"}</div>
          </div>
          <div className="space-y-1 p-6">
            <h1 className="text-2xl font-semibold">{quote.title}</h1>
            <div className="text-sm text-muted-foreground">
              Prepared for {lead?.contact_person || lead?.customer_name}
              {lead?.company_name ? ` · ${lead.company_name}` : ""}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {quote.valid_until && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" /> Valid until {format(parseISO(quote.valid_until), "dd MMM yyyy")}
                </span>
              )}
              {expired && <Badge variant="outline" className="border-destructive/50 text-destructive">Expired</Badge>}
              {accepted && <Badge className="bg-emerald-500/10 text-emerald-700">Accepted</Badge>}
              {revision && <Badge className="bg-amber-500/10 text-amber-700">Revision requested</Badge>}
            </div>
          </div>
        </Card>

        <Card className="p-0">
          <h2 className="border-b px-6 py-3 text-sm font-semibold">Line items</h2>
          <div className="divide-y">
            {items.length === 0 && <div className="p-6 text-sm text-muted-foreground">No line items</div>}
            {items.map((it: any) => (
              <div key={it.id} className="grid grid-cols-12 gap-3 px-6 py-3 text-sm">
                <div className="col-span-6">{it.name}</div>
                <div className="col-span-2 text-right">{Number(it.quantity)}</div>
                <div className="col-span-2 text-right">{Number(it.unit_price).toLocaleString()}</div>
                <div className="col-span-2 text-right font-medium">{Number(it.total).toLocaleString()}</div>
              </div>
            ))}
          </div>
          <div className="space-y-1 border-t px-6 py-4 text-sm">
            <Row label="Subtotal" value={`${quote.currency} ${Number(quote.subtotal).toLocaleString()}`} />
            {Number(quote.discount_pct) > 0 && <Row label={`Discount (${quote.discount_pct}%)`} value="" muted />}
            {Number(quote.tax_pct) > 0 && <Row label={`Tax (${quote.tax_pct}%)`} value="" muted />}
            <div className="mt-2 flex items-center justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span><span>{quote.currency} {Number(quote.amount).toLocaleString()}</span>
            </div>
          </div>
        </Card>

        {quote.notes && (
          <Card className="p-6 text-sm">
            <h2 className="mb-1 font-semibold">Notes</h2>
            <p className="whitespace-pre-wrap text-muted-foreground">{quote.notes}</p>
          </Card>
        )}

        {!responded ? (
          <Card className="space-y-3 p-6">
            <h2 className="text-sm font-semibold">Your response</h2>
            <div>
              <Label>Your name</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Name for the record" />
            </div>
            <div>
              <Label>Comment (optional)</Label>
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Any notes or questions" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => respond.mutate({ decision: "accepted", client_name: clientName, comment })}
                disabled={respond.isPending}>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Accept quotation
              </Button>
              <Button variant="outline" onClick={() => respond.mutate({ decision: "revision_requested", client_name: clientName, comment })}
                disabled={respond.isPending || !comment.trim()}>
                <MessageSquare className="mr-1 h-4 w-4" /> Request revision
              </Button>
            </div>
            {!comment.trim() && <p className="text-xs text-muted-foreground">A comment is required when requesting a revision.</p>}
          </Card>
        ) : (
          <Card className="p-6 text-sm">
            <div className="font-semibold">
              {accepted ? "Thank you — your acceptance has been recorded." : "Your revision request has been sent to the team."}
            </div>
            {share.responded_at && (
              <div className="mt-1 text-xs text-muted-foreground">
                Submitted {format(parseISO(share.responded_at), "dd MMM yyyy HH:mm")}
              </div>
            )}
          </Card>
        )}
      </div>
    </main>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex justify-between ${muted ? "text-muted-foreground" : ""}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
