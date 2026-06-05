import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles, Wand2, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { extractBrief } from "@/lib/proposals/extractBrief.functions";
import { fmtBDT } from "@/lib/proposals/utils";

export const Route = createFileRoute("/_authenticated/proposals/brief")({
  component: QuickBriefPage,
});

const EXAMPLES = [
  "Fortinet firewall solution for a 500-user bank in Dhaka, need network segmentation and SIEM integration",
  "Rubrik backup and immutable cyber recovery for a textile group with 12TB of SAP HANA + file shares",
  "MSSP / 24x7 SOC monitoring for an MFS provider, must align with Bangladesh Bank ICT Security Guideline",
  "LinkShadow NDR + Gurucul UEBA for a telco's core network, 3 data centers",
];

const STAGES = [
  "Reading client profile…",
  "Pulling product specs…",
  "Estimating BDT pricing…",
  "Drafting solution outline…",
  "Reviewing recommendations…",
];

function QuickBriefPage() {
  const router = useRouter();
  const extract = useServerFn(extractBrief);
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);

  async function run() {
    if (brief.trim().length < 10) {
      toast.error("Please describe what you need (at least 10 characters).");
      return;
    }
    setBusy(true);
    setStage(0);
    const tick = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 1800);
    try {
      const res = await extract({ data: { brief: brief.trim() } });
      // Stash extraction for /proposals/new to consume
      sessionStorage.setItem(
        "deskiq_proposal_brief_seed",
        JSON.stringify({ brief, extraction: res, at: Date.now() }),
      );
      toast.success("Brief understood. Opening wizard…");
      router.navigate({ to: "/proposals/new" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI failed");
    } finally {
      clearInterval(tick);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Proposal Writer</h1>
        <p className="text-sm text-muted-foreground">
          Describe the opportunity in plain language — English, বাংলা, or Banglish. AI will draft a SmartData-branded
          proposal with realistic BDT pricing across our OEM partners.
        </p>
      </div>

      <Card className="border-border/60 bg-card/40 backdrop-blur">
        <CardContent className="space-y-4 p-5">
          <div className="space-y-2">
            <label className="text-sm font-medium">Tell me about this opportunity</label>
            <Textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              disabled={busy}
              rows={8}
              placeholder="e.g. Fortinet firewall solution for a 500-user bank in Dhaka, need network segmentation and SIEM integration. Competing against another local SI. Budget around ৳1.5 crore."
              className="resize-none"
            />
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{brief.length} chars · BDT format like ৳25,00,000 or "25 lakh" works fine</span>
              <span className="hidden sm:inline">Tip: mention industry, scale, competitors, budget</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                disabled={busy}
                onClick={() => setBrief(ex)}
                className="rounded-full border border-border/60 bg-background/40 px-2.5 py-1 text-[11px] text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-300"
              >
                {ex.slice(0, 70)}…
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-border/40 pt-3">
            <div className="flex flex-wrap gap-1">
              {["Fortinet", "Rubrik", "HivePro", "Gambit Cyber", "Gurucul", "LinkShadow", "Adaptiva", "DEEPX", "Gopher Security"].map((p) => (
                <Badge key={p} variant="outline" className="border-emerald-500/30 text-[10px] text-emerald-300">
                  {p}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => router.navigate({ to: "/proposals" })} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => router.navigate({ to: "/proposals/new" })}
              disabled={busy}
            >
              Skip — open wizard
            </Button>
            <Button
              className="ml-auto bg-emerald-500 hover:bg-emerald-600"
              onClick={run}
              disabled={busy || brief.trim().length < 10}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              {busy ? "Generating…" : "Generate Proposal"}
              {!busy && <ChevronRight className="ml-1 h-4 w-4" />}
            </Button>
          </div>

          {busy && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-300">
                <Sparkles className="h-4 w-4 animate-pulse" /> {STAGES[stage]}
              </div>
              <div className="space-y-1">
                {STAGES.map((s, i) => (
                  <div
                    key={s}
                    className={
                      i < stage
                        ? "text-[11px] text-emerald-300/70"
                        : i === stage
                        ? "text-[11px] font-medium text-emerald-200"
                        : "text-[11px] text-muted-foreground/60"
                    }
                  >
                    {i < stage ? "✓ " : i === stage ? "• " : "  "}
                    {s}
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[10px] text-muted-foreground">
                Typical generation: 10–20 seconds. Approximate price examples: {fmtBDT(2500000)} (25 lakh),{" "}
                {fmtBDT(35000000)} (3.5 crore).
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
