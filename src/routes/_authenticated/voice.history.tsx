import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, FileText, CheckSquare, Loader2, AlertCircle, Mic } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/voice/history")({
  component: VoiceHistoryPage,
});

type Row = {
  id: string;
  created_at: string;
  duration_seconds: number | null;
  transcript_bn: string | null;
  transcript_en: string | null;
  detected_language: string | null;
  processing_status: string;
  error_message: string | null;
  audio_path: string | null;
  extracted_data: any;
  linked_visit_id: string | null;
  linked_task_ids: string[] | null;
};

function statusBadge(s: string) {
  switch (s) {
    case "done":
      return <Badge className="bg-emerald-500 hover:bg-emerald-500">Done</Badge>;
    case "processing":
      return (
        <Badge variant="secondary">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          Processing
        </Badge>
      );
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    default:
      return <Badge variant="outline">{s}</Badge>;
  }
}

function VoiceHistoryPage() {
  const { user } = useAuth();
  const [playing, setPlaying] = useState<string | null>(null);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: ["voice-inputs", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voice_inputs")
        .select(
          "id,created_at,duration_seconds,transcript_bn,transcript_en,detected_language,processing_status,error_message,audio_path,extracted_data,linked_visit_id,linked_task_ids",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return data as Row[];
    },
    enabled: !!user,
  });

  async function play(row: Row) {
    if (!row.audio_path) return;
    if (audioUrls[row.id]) {
      setPlaying(row.id);
      return;
    }
    const { data, error } = await supabase.storage
      .from("voice-recordings")
      .createSignedUrl(row.audio_path, 3600);
    if (error || !data) return;
    setAudioUrls((m) => ({ ...m, [row.id]: data.signedUrl }));
    setPlaying(row.id);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Mic className="h-6 w-6" /> Voice notes
          </h1>
          <p className="text-sm text-muted-foreground">
            Past voice recordings, transcripts, and linked CRM records.
          </p>
        </div>
      </div>

      {q.isLoading && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Loading…
        </Card>
      )}

      {q.data?.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No voice notes yet. Hold the floating mic button to record your first one.
        </Card>
      )}

      <div className="space-y-3">
        {q.data?.map((row) => {
          const transcript =
            row.detected_language === "en"
              ? row.transcript_en
              : row.transcript_bn || row.transcript_en;
          const isBn = row.detected_language !== "en" && !!row.transcript_bn;
          const ed = row.extracted_data ?? {};
          return (
            <Card key={row.id} className="p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  {new Date(row.created_at).toLocaleString()}
                  {row.duration_seconds ? ` · ${row.duration_seconds}s` : ""}
                  {row.detected_language ? ` · ${row.detected_language.toUpperCase()}` : ""}
                </div>
                {statusBadge(row.processing_status)}
              </div>

              {ed?.client_name && (
                <div className="mb-1 text-sm font-semibold">{ed.client_name}</div>
              )}

              <p
                className={cn("line-clamp-3 text-sm text-muted-foreground")}
                style={isBn ? { fontFamily: "'Hind Siliguri', system-ui, sans-serif" } : undefined}
              >
                {transcript || (row.processing_status === "failed" ? row.error_message : "—")}
              </p>

              {row.processing_status === "failed" && (
                <div className="mt-2 flex items-start gap-1.5 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{row.error_message || "Processing failed."}</span>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {row.audio_path && (
                  <Button size="sm" variant="outline" onClick={() => play(row)}>
                    <Play className="mr-1 h-3.5 w-3.5" /> Play
                  </Button>
                )}
                {row.linked_visit_id && (
                  <Button size="sm" variant="ghost" asChild>
                    <Link to="/visits">
                      <FileText className="mr-1 h-3.5 w-3.5" /> Visit
                    </Link>
                  </Button>
                )}
                {row.linked_task_ids?.length ? (
                  <Button size="sm" variant="ghost" asChild>
                    <Link to="/tasks">
                      <CheckSquare className="mr-1 h-3.5 w-3.5" /> {row.linked_task_ids.length} task
                      {row.linked_task_ids.length > 1 ? "s" : ""}
                    </Link>
                  </Button>
                ) : null}
              </div>

              {playing === row.id && audioUrls[row.id] && (
                <audio src={audioUrls[row.id]} controls autoPlay className="mt-2 w-full" />
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
