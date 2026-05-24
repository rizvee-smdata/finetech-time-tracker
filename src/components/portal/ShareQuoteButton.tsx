import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Share2, Copy, Eye, Check, X } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

function makeToken() {
  const arr = new Uint8Array(18);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function ShareQuoteButton({ quoteId, userId }: { quoteId: string; userId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const shares = useQuery({
    queryKey: ["quote-shares", quoteId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_quote_shares")
        .select("*")
        .eq("quote_id", quoteId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = async () => {
    setBusy(true);
    try {
      const token = makeToken();
      const { error } = await supabase.from("crm_quote_shares").insert({
        quote_id: quoteId, token, created_by: userId,
      });
      if (error) throw error;
      toast.success("Share link created");
      shares.refetch();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    const { error } = await supabase.from("crm_quote_shares")
      .update({ revoked_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Link revoked");
    shares.refetch();
  };

  const urlFor = (token: string) => `${window.location.origin}/q/${token}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Share2 className="mr-1 size-4" /> Share</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Share quotation with client</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Button onClick={create} disabled={busy} size="sm">
            {busy ? "Creating…" : "Create new share link"}
          </Button>
          <div className="space-y-2">
            {(shares.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No share links yet.</p>
            )}
            {(shares.data ?? []).map((s: any) => {
              const url = urlFor(s.token);
              return (
                <div key={s.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {s.revoked_at ? (
                      <Badge variant="outline" className="text-destructive">Revoked</Badge>
                    ) : s.response === "accepted" ? (
                      <Badge className="bg-emerald-500/10 text-emerald-700"><Check className="mr-1 h-3 w-3" />Accepted</Badge>
                    ) : s.response === "revision_requested" ? (
                      <Badge className="bg-amber-500/10 text-amber-700">Revision requested</Badge>
                    ) : (
                      <Badge variant="outline">Active</Badge>
                    )}
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Eye className="h-3 w-3" /> {s.view_count} views
                    </span>
                    {s.last_viewed_at && (
                      <span className="text-xs text-muted-foreground">
                        · last {format(parseISO(s.last_viewed_at), "dd MMM HH:mm")}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    <Input value={url} readOnly className="h-8 text-xs" />
                    <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(url); toast.success("Copied"); }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    {!s.revoked_at && (
                      <Button size="icon" variant="ghost" onClick={() => revoke(s.id)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  {s.response_comment && (
                    <div className="mt-2 rounded bg-muted/50 p-2 text-xs">
                      <span className="font-medium">{s.client_name || "Client"}:</span> {s.response_comment}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
