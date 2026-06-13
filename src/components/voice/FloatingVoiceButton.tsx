import { useEffect, useRef, useState } from "react";
import { Mic, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { processVoiceInput } from "@/lib/voice.functions";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { VoiceConfirmationSheet, type VoiceInputRecord } from "./VoiceConfirmationSheet";

type State = "idle" | "recording" | "uploading" | "processing";

export function FloatingVoiceButton() {
  const { user } = useAuth();
  const [state, setState] = useState<State>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [sheetRecord, setSheetRecord] = useState<VoiceInputRecord | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startTsRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const processFn = useServerFn(processVoiceInput);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  async function start() {
    if (!user) {
      toast.error("Please sign in to use voice input.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Microphone not available in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => void handleStop();
      rec.start();
      recRef.current = rec;
      startTsRef.current = Date.now();
      setElapsed(0);
      setState("recording");
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTsRef.current) / 1000));
      }, 250);
    } catch {
      toast.error("Microphone permission denied.");
    }
  }

  function stop() {
    if (state !== "recording") return;
    if (timerRef.current) clearInterval(timerRef.current);
    recRef.current?.stop();
  }

  async function handleStop() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const duration = Math.floor((Date.now() - startTsRef.current) / 1000);
    if (duration < 1) {
      toast.error("Recording too short — hold and speak.");
      setState("idle");
      return;
    }

    setState("uploading");
    try {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      if (!user) throw new Error("Not signed in");
      const path = `${user.id}/${crypto.randomUUID()}.webm`;
      const { error: upErr } = await supabase.storage
        .from("voice-recordings")
        .upload(path, blob, { contentType: "audio/webm", upsert: false });
      if (upErr) throw new Error(upErr.message);

      setState("processing");
      const record = await processFn({ data: { audioPath: path, durationSeconds: duration } });
      setSheetRecord(record as VoiceInputRecord);
      setState("idle");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to process voice.";
      toast.error(msg);
      setState("idle");
    }
  }

  const busy = state !== "idle";
  const recording = state === "recording";
  const processing = state === "uploading" || state === "processing";

  return (
    <>
      <button
        type="button"
        aria-label={recording ? "Stop recording" : "Start voice note"}
        onMouseDown={start}
        onMouseUp={stop}
        onMouseLeave={() => recording && stop()}
        onTouchStart={(e) => {
          e.preventDefault();
          start();
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          stop();
        }}
        disabled={processing}
        className={cn(
          "fixed left-4 bottom-20 md:bottom-6 z-50",
          "h-16 w-16 rounded-full grid place-items-center",
          "shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] transition-transform select-none",
          "bg-[var(--gradient-primary,linear-gradient(135deg,hsl(var(--primary)),hsl(var(--primary))))] text-primary-foreground",
          recording && "scale-95 ring-4 ring-destructive/40 animate-pulse",
          processing && "opacity-80 cursor-wait",
        )}
        style={{ touchAction: "none" }}
      >
        {processing ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <Mic className={cn("h-7 w-7", recording && "text-white")} />
        )}
        {recording && (
          <>
            <span className="absolute inset-0 rounded-full ring-2 ring-destructive animate-ping" />
            <span className="absolute -top-7 left-1/2 -translate-x-1/2 rounded-full bg-destructive px-2 py-0.5 text-[11px] font-semibold text-white tabular-nums">
              ● {formatTime(elapsed)}
            </span>
          </>
        )}
        {state === "processing" && (
          <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background">
            Processing…
          </span>
        )}
        {state === "uploading" && (
          <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background">
            Uploading…
          </span>
        )}
      </button>

      <VoiceConfirmationSheet
        record={sheetRecord}
        open={!!sheetRecord}
        onOpenChange={(o) => !o && setSheetRecord(null)}
      />
      {busy && <span className="sr-only">Recording in progress</span>}
    </>
  );
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
