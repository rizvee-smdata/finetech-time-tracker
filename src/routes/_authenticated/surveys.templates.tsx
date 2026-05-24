import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { SurveyTemplate } from "@/lib/surveys/types";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/surveys/templates")({
  component: TemplatesPage,
});

function TemplatesPage() {
  const { user, companyId, isStaff } = useAuth();
  const qc = useQueryClient();

  const templates = useQuery({
    queryKey: ["survey-templates", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("survey_templates")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SurveyTemplate[];
    },
  });

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [questionsText, setQuestionsText] = useState("How did the meeting go?\nWhat are the next steps?\nAny blockers?");

  if (!isStaff) {
    return <Card className="p-6 text-sm text-muted-foreground">Only managers and admins can manage templates.</Card>;
  }

  const create = async () => {
    if (!companyId || !user || !title.trim()) {
      toast.error("Title is required");
      return;
    }
    const questions = questionsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((label, i) => ({ id: `q${i + 1}`, label, type: "text" as const }));
    const { error } = await sb.from("survey_templates").insert({
      company_id: companyId,
      title: title.trim(),
      description: desc.trim() || null,
      questions,
      created_by: user.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Template created");
    setOpen(false);
    setTitle("");
    setDesc("");
    qc.invalidateQueries({ queryKey: ["survey-templates", companyId] });
  };

  const toggleActive = async (t: SurveyTemplate) => {
    const { error } = await sb.from("survey_templates").update({ is_active: !t.is_active }).eq("id", t.id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["survey-templates", companyId] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {(templates.data ?? []).length} template{(templates.data ?? []).length === 1 ? "" : "s"}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">New template</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New survey template</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="t-title">Title</Label>
                <Input id="t-title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-desc">Description</Label>
                <Input id="t-desc" value={desc} onChange={(e) => setDesc(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-q">Questions (one per line)</Label>
                <Textarea id="t-q" rows={6} value={questionsText} onChange={(e) => setQuestionsText(e.target.value)} />
              </div>
              <div className="flex justify-end">
                <Button onClick={create}>Create</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {(templates.data ?? []).length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No templates yet. Create one to standardize post-visit surveys.
        </Card>
      ) : (
        <div className="space-y-2">
          {(templates.data ?? []).map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t.title}</span>
                    {t.is_active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
                  </div>
                  {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
                  <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                    {t.questions.map((q) => <li key={q.id}>{q.label}</li>)}
                  </ul>
                </div>
                <Button size="sm" variant="outline" onClick={() => toggleActive(t)}>
                  {t.is_active ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
