import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { inferSentiment } from "@/lib/surveys/types";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/surveys/new")({
  component: NewSurveyPage,
});

function NewSurveyPage() {
  const { user, companyId } = useAuth();
  const nav = useNavigate();
  const [customerName, setCustomerName] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState(false);
  const [followUpAt, setFollowUpAt] = useState("");
  const [interest, setInterest] = useState("");
  const [objections, setObjections] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !user) return;
    if (!customerName.trim()) {
      toast.error("Customer name is required");
      return;
    }
    setSubmitting(true);
    const { error } = await sb.from("survey_responses").insert({
      company_id: companyId,
      submitted_by: user.id,
      customer_name: customerName.trim(),
      rating,
      sentiment: inferSentiment(rating),
      answers: { interest, objections },
      notes: notes.trim() || null,
      follow_up_required: followUp,
      follow_up_at: followUp && followUpAt ? followUpAt : null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Feedback submitted");
    nav({ to: "/surveys" });
  };

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="customer">Customer / company</Label>
          <Input id="customer" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
        </div>

        <div className="space-y-1.5">
          <Label>Overall rating</Label>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                className="p-1 transition-transform hover:scale-110"
                aria-label={`Rate ${n}`}
              >
                <Star
                  className={cn(
                    "h-7 w-7",
                    rating != null && n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
                  )}
                />
              </button>
            ))}
            {rating != null && (
              <button type="button" onClick={() => setRating(null)} className="ml-2 text-xs text-muted-foreground hover:underline">
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="interest">Interest level / next steps</Label>
            <Input id="interest" value={interest} onChange={(e) => setInterest(e.target.value)} placeholder="e.g. Ready to sign, evaluating options" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="objections">Key objections / blockers</Label>
            <Input id="objections" value={objections} onChange={(e) => setObjections(e.target.value)} placeholder="Pricing, timing, approvals…" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What went well? What needs attention?" />
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={followUp} onCheckedChange={(v) => setFollowUp(v === true)} />
            Schedule a follow-up
          </label>
          {followUp && (
            <div className="space-y-1">
              <Label htmlFor="followup" className="text-xs">Follow-up date</Label>
              <Input id="followup" type="date" value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => nav({ to: "/surveys" })}>Cancel</Button>
          <Button type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Submit feedback"}</Button>
        </div>
      </form>
    </Card>
  );
}
