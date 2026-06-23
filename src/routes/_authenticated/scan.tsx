import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Camera, FileUp, Loader2, Save, Trash2, RefreshCcw, Plus, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { processCardScan, saveCardScanToCrm, updateCardScanStatus } from "@/lib/cardScan/process.functions";
import { confidenceColor, confidenceLabel, type ExtractedFields, type Confidence, type DuplicateMatch } from "@/lib/cardScan/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/scan")({
  component: ScanPage,
});

type ResultState = {
  scan_id: string;
  signed_url: string | null;
  extracted: ExtractedFields;
  confidence: Confidence;
  duplicate: DuplicateMatch | null;
};

type QueueItem = {
  id: string;
  file: File;
  preview: string;
  status: "queued" | "processing" | "done" | "error";
  result?: ResultState;
  error?: string;
};

function ConfidenceDot({ score }: { score: number | undefined }) {
  return (
    <span
      title={confidenceLabel(score)}
      className={cn("inline-block h-2 w-2 rounded-full", confidenceColor(score))}
    />
  );
}

function ScanPage() {
  const { user, companyId } = useAuth();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [form, setForm] = useState<any>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  const processFn = useServerFn(processCardScan);
  const saveFn = useServerFn(saveCardScanToCrm);
  const updateFn = useServerFn(updateCardScanStatus);

  const processMutation = useMutation({
    mutationFn: async ({ file, source }: { file: File; source: "card" | "document" | "bulk" }) => {
      if (!companyId || !user) throw new Error("Sign in required");
      // Compress images client-side. Phone-camera photos can be 5–15MB which
      // causes Cloudflare Worker request-size/timeout failures that surface in
      // the browser as a generic "Failed to fetch" TypeError.
      let uploadBlob: Blob = file;
      let ext = file.name.split(".").pop()?.toLowerCase() || "bin";
      let mime = file.type || "application/octet-stream";
      if (file.type.startsWith("image/")) {
        try {
          uploadBlob = await compressImage(file, 1600, 0.82);
          mime = "image/jpeg";
          ext = "jpg";
        } catch {
          // fall back to the original file
        }
      }
      const path = `${companyId}/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      try {
        const { error: upErr } = await supabase.storage.from("card-scans").upload(path, uploadBlob, {
          contentType: mime,
        });
        if (upErr) throw new Error(upErr.message);
      } catch (e: any) {
        const msg = e?.message ?? "";
        if (/failed to fetch|network|load failed/i.test(msg)) {
          throw new Error("Upload failed — please check your connection and try again.");
        }
        throw e;
      }
      try {
        const res: any = await processFn({
          data: {
            company_id: companyId,
            file_path: path,
            file_mime: mime,
            source,
          },
        });
        return res;
      } catch (e: any) {
        const msg = e?.message ?? "";
        if (/failed to fetch|network|load failed/i.test(msg)) {
          throw new Error("Network error while processing the card. Try a clearer/smaller image and try again.");
        }
        throw e;
      }
    },
    onSuccess: (res) => {
      const r: ResultState = {
        scan_id: res.scan.id,
        signed_url: res.signed_url,
        extracted: res.scan.extracted,
        confidence: res.scan.confidence ?? {},
        duplicate: res.duplicate,
      };
      setResult(r);
      seedForm(r.extracted);
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not process scan"),
  });

  function seedForm(e: ExtractedFields) {
    setForm({
      full_name: e.full_name ?? "",
      job_title: e.job_title ?? "",
      company_name: e.company_name ?? "",
      phone: e.phones?.[0] ?? "",
      extra_phones: e.phones?.slice(1) ?? [],
      email: e.emails?.[0] ?? "",
      address: e.address ?? "",
      website: e.website ?? "",
      linkedin: e.linkedin ?? "",
      industry_guess: e.industry_guess ?? "",
      notes: "",
    });
  }

  const handleSingle = (file: File, source: "card" | "document") => {
    setResult(null);
    setForm(null);
    setPreviewUrl(URL.createObjectURL(file));
    processMutation.mutate({ file, source });
  };

  const handleBulkFiles = (files: FileList) => {
    const items: QueueItem[] = Array.from(files).map((f) => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      preview: URL.createObjectURL(f),
      status: "queued",
    }));
    setQueue((prev) => [...prev, ...items]);
    // process sequentially
    void runQueue([...items]);
  };

  async function runQueue(items: QueueItem[]) {
    for (const item of items) {
      setQueue((prev) => prev.map((p) => (p.id === item.id ? { ...p, status: "processing" } : p)));
      try {
        const res: any = await processMutation.mutateAsync({ file: item.file, source: "bulk" });
        const r: ResultState = {
          scan_id: res.scan.id,
          signed_url: res.signed_url,
          extracted: res.scan.extracted,
          confidence: res.scan.confidence ?? {},
          duplicate: res.duplicate,
        };
        setQueue((prev) => prev.map((p) => (p.id === item.id ? { ...p, status: "done", result: r } : p)));
      } catch (e: any) {
        setQueue((prev) => prev.map((p) => (p.id === item.id ? { ...p, status: "error", error: e?.message } : p)));
      }
    }
  }

  const save = useMutation({
    mutationFn: async (mergeId: string | null) => {
      if (!result || !form || !companyId) throw new Error("Nothing to save");
      return saveFn({
        data: {
          scan_id: result.scan_id,
          company_id: companyId,
          fields: { ...form },
          merge_into_lead_id: mergeId,
        },
      });
    },
    onSuccess: () => {
      toast.success("Saved to CRM");
      reset();
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const discard = useMutation({
    mutationFn: async () => {
      if (!result || !companyId) return;
      return updateFn({ data: { scan_id: result.scan_id, company_id: companyId, status: "discarded" } });
    },
    onSuccess: () => {
      toast("Discarded");
      reset();
    },
  });

  function reset() {
    setResult(null);
    setForm(null);
    setPreviewUrl(null);
    if (bulkMode) {
      setQueue((prev) => prev.filter((p, i) => i !== activeIdx));
      setActiveIdx(0);
    }
  }

  // Bulk: show next queued done item
  const activeBulk = bulkMode ? queue.filter((q) => q.status === "done")[activeIdx] : null;
  const showResult = result ?? activeBulk?.result ?? null;
  const showPreview = previewUrl ?? activeBulk?.preview ?? showResult?.signed_url ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Scan business card</h1>
          <p className="text-sm text-muted-foreground">Snap a card or upload a document — AI fills the contact form.</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/scan/history"><History className="mr-2 h-4 w-4" /> History</Link>
        </Button>
      </header>

      {!showResult && !processMutation.isPending && (
        <Card>
          <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
            <Button
              size="lg"
              className="h-28 flex-col gap-2 text-base"
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera className="h-8 w-8" />
              Scan Business Card
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="h-28 flex-col gap-2 text-base"
              onClick={() => docInputRef.current?.click()}
            >
              <FileUp className="h-8 w-8" />
              Upload Document
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-28 flex-col gap-2 text-base"
              onClick={() => {
                setBulkMode(true);
                bulkInputRef.current?.click();
              }}
            >
              <Plus className="h-8 w-8" />
              Scan Multiple
            </Button>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleSingle(e.target.files[0], "card")}
            />
            <input
              ref={docInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleSingle(e.target.files[0], "document")}
            />
            <input
              ref={bulkInputRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              className="hidden"
              onChange={(e) => e.target.files && handleBulkFiles(e.target.files)}
            />
          </CardContent>
        </Card>
      )}

      {processMutation.isPending && !bulkMode && (
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Reading card…
          </CardContent>
        </Card>
      )}

      {bulkMode && queue.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Queue ({queue.length})</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {queue.map((q, i) => (
              <div
                key={q.id}
                className={cn(
                  "relative h-16 w-24 cursor-pointer overflow-hidden rounded border-2",
                  q.status === "done" && queue.filter((x) => x.status === "done")[activeIdx]?.id === q.id
                    ? "border-primary"
                    : "border-transparent",
                )}
                onClick={() => {
                  if (q.status === "done") {
                    const doneList = queue.filter((x) => x.status === "done");
                    const idx = doneList.findIndex((x) => x.id === q.id);
                    if (idx >= 0) {
                      setActiveIdx(idx);
                      if (q.result) seedForm(q.result.extracted);
                    }
                  }
                }}
              >
                <img src={q.preview} alt="" className="h-full w-full object-cover" />
                {q.status === "processing" && (
                  <div className="absolute inset-0 grid place-items-center bg-black/40">
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  </div>
                )}
                {q.status === "error" && <div className="absolute inset-0 bg-red-500/40" />}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {showResult && form && (
        <Card>
          <CardContent className="grid grid-cols-1 gap-6 p-4 md:grid-cols-[280px_1fr]">
            <div className="space-y-3">
              {showPreview && (
                <img
                  src={showPreview}
                  alt="card"
                  className="aspect-[1.6/1] w-full rounded-md border object-cover"
                />
              )}
              {showResult.extracted.industry_guess && (
                <div className="text-sm">
                  <div className="text-muted-foreground">Detected industry</div>
                  <Input
                    value={form.industry_guess}
                    onChange={(e) => setForm({ ...form, industry_guess: e.target.value })}
                  />
                </div>
              )}
              {showResult.extracted.language_detected && (
                <Badge variant="outline">Language: {showResult.extracted.language_detected}</Badge>
              )}
            </div>

            <div className="space-y-3">
              {showResult.duplicate && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700/60 dark:bg-amber-950/30">
                  <div className="font-medium">Possible duplicate</div>
                  <div className="text-muted-foreground">
                    {showResult.duplicate.customer_name}
                    {showResult.duplicate.company_name ? ` — ${showResult.duplicate.company_name}` : ""}{" "}
                    ({showResult.duplicate.match_reason})
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link to="/crm/$leadId" params={{ leadId: showResult.duplicate.id }}>View</Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => save.mutate(showResult.duplicate!.id)}
                      disabled={save.isPending}
                    >
                      Merge
                    </Button>
                    <Button size="sm" onClick={() => save.mutate(null)} disabled={save.isPending}>
                      Save as new
                    </Button>
                  </div>
                </div>
              )}

              <Field label="Full Name" score={showResult.confidence.full_name}>
                <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </Field>
              <Field label="Job Title" score={showResult.confidence.job_title}>
                <Input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} />
              </Field>
              <Field label="Company" score={showResult.confidence.company_name}>
                <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
              </Field>
              <Field label="Phone" score={showResult.confidence.phones}>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                {form.extra_phones.length > 0 && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Also detected: {form.extra_phones.join(", ")}
                  </div>
                )}
              </Field>
              <Field label="Email" score={showResult.confidence.emails}>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="Address" score={showResult.confidence.address}>
                <Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </Field>
              <Field label="Website" score={showResult.confidence.website}>
                <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
              </Field>
              <Field label="LinkedIn" score={showResult.confidence.linkedin}>
                <Input value={form.linkedin} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} />
              </Field>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  size="lg"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => save.mutate(null)}
                  disabled={save.isPending || !form.full_name}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {save.isPending ? "Saving…" : "Save to CRM"}
                </Button>
                <Button variant="outline" onClick={() => discard.mutate()} disabled={discard.isPending}>
                  <Trash2 className="mr-2 h-4 w-4" /> Discard
                </Button>
                <Button variant="ghost" onClick={reset}>
                  <RefreshCcw className="mr-2 h-4 w-4" /> Scan another
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, score, children }: { label: string; score: number | undefined; children: React.ReactNode }) {
  const low = (score ?? 0) < 0.6;
  return (
    <div className={cn("space-y-1 rounded-md p-2", low && "bg-red-50 dark:bg-red-950/20")}>
      <div className="flex items-center justify-between">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
        <ConfidenceDot score={score} />
      </div>
      {children}
    </div>
  );
}
