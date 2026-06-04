import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MicButton } from "@/components/MicButton";
import { toast } from "sonner";
import { Sparkles, Save, RotateCw, Plus, X, Loader2 } from "lucide-react";
import { addDays, EMPTY_REPORT, normalizeReport, type ActionItem, type Lang, type Tone, type VisitReportContent } from "@/lib/aiVisits";

export const Route = createFileRoute("/_authenticated/ai-visits/new")({
  component: NewAIVisit,
});

function NewAIVisit() {
  const { user, companyId } = useAuth();
  const navigate = useNavigate();

  const [accountId, setAccountId] = useState<string>("");
  const [clientName, setClientName] = useState<string>("");
  const [visitDate, setVisitDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState<string>("");
  const [rawNotes, setRawNotes] = useState<string>("");
  const [tone, setTone] = useState<Tone>("formal");
  const [language, setLanguage] = useState<Lang>("en");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<VisitReportContent | null>(null);

  // Accounts dropdown
  const { data: accounts = [] } = useQuery({
    queryKey: ["crm-accounts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_accounts")
        .select("id, name, address")
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Pre-select latest check-in's lead_id → account
  const { data: latestCheckin } = useQuery({
    queryKey: ["latest-checkin", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("visit_checkins")
        .select("client_name, lead_id, checkin_time")
        .eq("user_id", user!.id)
        .order("checkin_time", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (latestCheckin && !clientName && !accountId) {
      if (latestCheckin.client_name) setClientName(latestCheckin.client_name);
    }
  }, [latestCheckin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rep profile
  const { data: profile } = useQuery({
    queryKey: ["profile-self", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name, email").eq("id", user!.id).maybeSingle();
      return data;
    },
  });
  const repName = profile?.full_name ?? profile?.email ?? "Rep";

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === accountId),
    [accounts, accountId],
  );
  useEffect(() => {
    if (selectedAccount) {
      setClientName(selectedAccount.name);
      if (selectedAccount.address) setLocation(selectedAccount.address);
    }
  }, [selectedAccount]);

  async function handleGenerate() {
    if (rawNotes.trim().length < 5) {
      toast.error("Add a few words of notes first.");
      return;
    }
    if (!clientName.trim()) {
      toast.error("Select or enter a client.");
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-visit-report", {
        body: {
          raw_notes: rawNotes,
          client_name: clientName,
          rep_name: repName,
          visit_date: visitDate,
          tone,
          language,
        },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      const parsed = normalizeReport((data as { report: unknown }).report);
      setReport(parsed);
      toast.success("Report generated");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to generate";
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!report || !user?.id || !companyId) return;
    setSaving(true);
    try {
      const { data: inserted, error } = await supabase
        .from("ai_visit_reports")
        .insert({
          company_id: companyId,
          user_id: user.id,
          account_id: accountId || null,
          client_name: clientName,
          visit_date: visitDate,
          location: location || null,
          raw_notes: rawNotes,
          tone,
          language,
          report: report as never,
          model: "claude-sonnet-4-20250514",
          generated_at: new Date().toISOString(),
          ai_generated: true,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Auto-create tasks from action_items
      let created = 0;
      if (report.action_items.length > 0) {
        const base = new Date(visitDate);
        const rows = report.action_items.map((a) => ({
          company_id: companyId,
          title: a.task.slice(0, 240),
          description: `From AI visit report (${clientName}). Suggested assignee: ${a.assignee}`,
          due_date: addDays(base, Math.max(1, a.due_days || 7)),
          scheduled_date: addDays(base, Math.max(1, a.due_days || 7)),
          created_by: user.id,
          category: "visit_followup",
        }));
        const { error: tErr, count } = await supabase
          .from("tms_tasks")
          .insert(rows, { count: "exact" });
        if (!tErr) created = count ?? rows.length;
        if (created > 0) {
          await supabase
            .from("ai_visit_reports")
            .update({ tasks_created_count: created })
            .eq("id", inserted.id);
        }
      }
      toast.success(`Report saved${created ? ` · ${created} tasks created` : ""}`);
      navigate({ to: "/ai-visits/$id", params: { id: inserted.id } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            AI Visit Summary
          </h1>
          <p className="text-sm text-muted-foreground">
            Capture rough notes, let AI write a structured report.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate({ to: "/ai-visits/history" })}>
          View History
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* LEFT: Notes input */}
        <Card className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Client</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder={clientName || "Select client account"} />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Visit Date</Label>
              <Input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Rep</Label>
              <Input value={repName} readOnly className="bg-muted" />
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Your rough notes (type or speak)</Label>
              <MicButton
                lang={language === "bn" ? "bn-BD" : "en-US"}
                onTranscript={(t) => setRawNotes((prev) => (prev ? prev + " " + t : t))}
              />
            </div>
            <Textarea
              value={rawNotes}
              onChange={(e) => setRawNotes(e.target.value)}
              rows={10}
              placeholder="e.g. Met with Mr. Karim, discussed Fortinet firewall renewal, they have budget issues, demo scheduled for next week, also interested in Rubrik backup..."
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tone</Label>
              <RadioGroup value={tone} onValueChange={(v) => setTone(v as Tone)} className="flex gap-4">
                {(["formal", "concise", "detailed"] as const).map((t) => (
                  <div key={t} className="flex items-center gap-2">
                    <RadioGroupItem id={`tone-${t}`} value={t} />
                    <Label htmlFor={`tone-${t}`} className="capitalize cursor-pointer">{t}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <div className="space-y-1.5">
              <Label>Language</Label>
              <RadioGroup value={language} onValueChange={(v) => setLanguage(v as Lang)} className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="lang-en" value="en" />
                  <Label htmlFor="lang-en" className="cursor-pointer">English</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="lang-bn" value="bn" />
                  <Label htmlFor="lang-bn" className="cursor-pointer">Bangla</Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          <Button
            size="lg"
            className="w-full"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Sparkles className="h-5 w-5 mr-2" />}
            {report ? "Regenerate Report" : "Generate Report with AI"}
          </Button>
        </Card>

        {/* RIGHT: Generated report */}
        <Card className="p-4 space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
          {!report && !generating && (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center text-muted-foreground gap-3">
              <Sparkles className="h-12 w-12 opacity-30" />
              <p>Your structured AI-generated report will appear here.</p>
            </div>
          )}
          {generating && !report && (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center text-muted-foreground gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p>Generating report with Claude…</p>
            </div>
          )}
          {report && (
            <ReportEditor report={report} onChange={setReport} clientName={clientName} repName={repName} visitDate={visitDate} />
          )}
          {report && (
            <div className="flex gap-2 pt-2 border-t">
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Report
              </Button>
              <Button variant="outline" onClick={handleGenerate} disabled={generating}>
                <RotateCw className="h-4 w-4 mr-2" />
                Regenerate
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export function ReportEditor({
  report,
  onChange,
  clientName,
  repName,
  visitDate,
  readOnly = false,
}: {
  report: VisitReportContent;
  onChange?: (r: VisitReportContent) => void;
  clientName: string;
  repName: string;
  visitDate: string;
  readOnly?: boolean;
}) {
  const update = (patch: Partial<VisitReportContent>) => onChange?.({ ...report, ...patch });

  return (
    <div className="space-y-4">
      {/* Overview */}
      <section>
        <h3 className="font-semibold mb-2">Client &amp; Visit Overview</h3>
        <div className="text-sm text-muted-foreground mb-2">
          <span className="font-medium text-foreground">{clientName}</span> · {repName} · {visitDate}
        </div>
        <Textarea
          value={report.overview}
          onChange={(e) => update({ overview: e.target.value })}
          readOnly={readOnly}
          rows={3}
        />
      </section>

      {/* Discussion points */}
      <section>
        <h3 className="font-semibold mb-2">Key Discussion Points</h3>
        <div className="space-y-2">
          {report.discussion_points.map((p, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-primary mt-2">•</span>
              <Input
                value={p}
                readOnly={readOnly}
                onChange={(e) => {
                  const next = [...report.discussion_points];
                  next[i] = e.target.value;
                  update({ discussion_points: next });
                }}
              />
              {!readOnly && (
                <Button size="icon" variant="ghost" onClick={() => update({ discussion_points: report.discussion_points.filter((_, j) => j !== i) })}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={() => update({ discussion_points: [...report.discussion_points, ""] })}>
              <Plus className="h-3 w-3 mr-1" /> Add point
            </Button>
          )}
        </div>
      </section>

      {/* Outcomes */}
      <section>
        <h3 className="font-semibold mb-2">Decisions &amp; Outcomes</h3>
        <Textarea value={report.outcomes} onChange={(e) => update({ outcomes: e.target.value })} readOnly={readOnly} rows={3} />
      </section>

      {/* Products */}
      <section>
        <h3 className="font-semibold mb-2">Products / Solutions Discussed</h3>
        <div className="flex flex-wrap gap-2">
          {report.products_discussed.map((p, i) => (
            <Badge key={i} variant="secondary" className="text-sm py-1 pr-1">
              {p}
              {!readOnly && (
                <button
                  className="ml-1 hover:text-destructive"
                  onClick={() => update({ products_discussed: report.products_discussed.filter((_, j) => j !== i) })}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
          {!readOnly && (
            <ProductAdd onAdd={(v) => update({ products_discussed: [...report.products_discussed, v] })} />
          )}
        </div>
      </section>

      {/* Action items */}
      <section>
        <h3 className="font-semibold mb-2">Action Items</h3>
        <div className="space-y-2">
          {report.action_items.map((a, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <Input
                className="col-span-6"
                value={a.task}
                readOnly={readOnly}
                placeholder="Task"
                onChange={(e) => {
                  const next = [...report.action_items];
                  next[i] = { ...a, task: e.target.value };
                  update({ action_items: next });
                }}
              />
              <Input
                className="col-span-3"
                value={a.assignee}
                readOnly={readOnly}
                placeholder="Assignee"
                onChange={(e) => {
                  const next = [...report.action_items];
                  next[i] = { ...a, assignee: e.target.value };
                  update({ action_items: next });
                }}
              />
              <Input
                type="number"
                className="col-span-2"
                value={a.due_days}
                readOnly={readOnly}
                onChange={(e) => {
                  const next = [...report.action_items];
                  next[i] = { ...a, due_days: parseInt(e.target.value) || 0 };
                  update({ action_items: next });
                }}
              />
              {!readOnly && (
                <Button size="icon" variant="ghost" onClick={() => update({ action_items: report.action_items.filter((_, j) => j !== i) })}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          {!readOnly && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                update({ action_items: [...report.action_items, { task: "", assignee: repName, due_days: 7 } as ActionItem] })
              }
            >
              <Plus className="h-3 w-3 mr-1" /> Add action
            </Button>
          )}
        </div>
        {!readOnly && (
          <p className="text-xs text-muted-foreground mt-1">
            Tasks will be auto-created in the task list on save.
          </p>
        )}
      </section>

      {/* Next visit */}
      <section>
        <h3 className="font-semibold mb-2">Next Visit Recommendation</h3>
        <Textarea
          value={report.next_visit_recommendation}
          onChange={(e) => update({ next_visit_recommendation: e.target.value })}
          readOnly={readOnly}
          rows={2}
        />
      </section>
    </div>
  );
}

function ProductAdd({ onAdd }: { onAdd: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="flex gap-1">
      <Input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="Add product"
        className="h-8 w-36"
        onKeyDown={(e) => {
          if (e.key === "Enter" && v.trim()) {
            onAdd(v.trim());
            setV("");
          }
        }}
      />
    </div>
  );
}
