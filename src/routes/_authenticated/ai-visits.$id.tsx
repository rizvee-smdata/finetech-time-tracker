import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Save, Sparkles, Pencil } from "lucide-react";
import { format } from "date-fns";
import { normalizeReport, type VisitReportContent } from "@/lib/aiVisits";
import { ReportEditor } from "./ai-visits.new";

export const Route = createFileRoute("/_authenticated/ai-visits/$id")({
  component: ViewReport,
});

function ViewReport() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<VisitReportContent | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["ai-visit-report", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_visit_reports")
        .select("*, profiles:user_id(full_name, email)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading || !data) {
    return <div className="container mx-auto p-6 text-muted-foreground">Loading…</div>;
  }

  const report = draft ?? normalizeReport(data.report);
  const repName =
    (data as { profiles?: { full_name?: string | null; email?: string | null } | null }).profiles?.full_name ??
    (data as { profiles?: { full_name?: string | null; email?: string | null } | null }).profiles?.email ??
    "Rep";

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("ai_visit_reports")
        .update({ report: draft as never })
        .eq("id", id);
      if (error) throw error;
      toast.success("Updated");
      setEditing(false);
      setDraft(null);
      refetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container mx-auto p-4 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate({ to: "/ai-visits/history" })}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex gap-2">
          {data.ai_generated && (
            <Badge variant="outline" className="gap-1">
              <Sparkles className="h-3 w-3 text-primary" /> AI Generated
            </Badge>
          )}
          {!editing ? (
            <Button size="sm" variant="outline" onClick={() => { setEditing(true); setDraft(normalizeReport(data.report)); }}>
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(null); }}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-1" /> Save
              </Button>
            </>
          )}
        </div>
      </div>

      <Card className="p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">{data.client_name}</h1>
          <p className="text-sm text-muted-foreground">
            {format(new Date(data.visit_date), "PPP")} · {repName}
            {data.location ? ` · ${data.location}` : ""}
          </p>
        </div>
        <ReportEditor
          report={report}
          onChange={editing ? setDraft : undefined}
          clientName={data.client_name}
          repName={repName}
          visitDate={data.visit_date}
          readOnly={!editing}
        />
      </Card>

      <Card className="p-4">
        <h3 className="font-semibold mb-2 text-sm">Original Notes</h3>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{data.raw_notes}</p>
      </Card>
    </div>
  );
}
