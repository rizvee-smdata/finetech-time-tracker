import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Copy, RefreshCw, Mail, Save } from "lucide-react";
import { toast } from "sonner";
import { useMeetingsStore } from "@/lib/meetings/storage";
import { analyzeMeeting } from "@/lib/meetings/analyze.functions";
import type { Meeting } from "@/lib/meetings/types";

export function FollowUpEmail({ meeting }: { meeting: Meeting }) {
  const p = meeting.processed!;
  const { setProcessedField, setProcessed } = useMeetingsStore();
  const analyze = useServerFn(analyzeMeeting);
  const [subject, setSubject] = useState(p.followUpSubject);
  const [body, setBody] = useState(p.followUpEmail);
  const [regen, setRegen] = useState(false);

  useEffect(() => {
    setSubject(p.followUpSubject);
    setBody(p.followUpEmail);
  }, [p.followUpSubject, p.followUpEmail]);

  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;

  const copy = async () => {
    await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    toast.success("Email copied to clipboard");
  };

  const openGmail = () => {
    const url = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
    window.open(url, "_blank");
  };

  const save = () => {
    setProcessedField(meeting.id, "followUpSubject", subject);
    setProcessedField(meeting.id, "followUpEmail", body);
    toast.success("Draft saved");
  };

  const regenerate = async () => {
    setRegen(true);
    try {
      const result = await analyze({
        data: {
          title: meeting.title,
          clientName: meeting.clientName,
          clientCompany: meeting.clientCompany,
          date: meeting.date,
          attendees: meeting.attendees,
          rawNotes: meeting.rawNotes,
          regenerateInstruction: "Rewrite the follow-up email with a fresh, slightly different tone while keeping all facts.",
        },
      });
      setProcessed(meeting.id, {
        ...result,
        actionItems: result.actionItems.map((a) => ({ ...a, id: "", done: false })),
        crmUpdates: result.crmUpdates.map((c) => ({ ...c, accepted: false })),
      });
      toast.success("Regenerated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to regenerate");
    } finally {
      setRegen(false);
    }
  };

  return (
    <Card className="border-border/60 bg-card/60 backdrop-blur">
      <CardContent className="space-y-3 p-5">
        <h3 className="font-semibold">Follow-up Email Draft</h3>
        <div>
          <Label htmlFor="email-subject">Subject</Label>
          <Input id="email-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="email-body">Body</Label>
          <Textarea
            id="email-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-[260px] font-sans"
          />
          <div className="mt-1 flex justify-between text-xs text-muted-foreground">
            <span>{body.length} characters</span>
            <span>{wordCount} words</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={copy}>
            <Copy className="mr-1 h-4 w-4" /> Copy Email
          </Button>
          <Button variant="outline" size="sm" onClick={regenerate} disabled={regen}>
            <RefreshCw className={`mr-1 h-4 w-4 ${regen ? "animate-spin" : ""}`} /> Regenerate
          </Button>
          <Button size="sm" className="bg-blue-500 text-white hover:bg-blue-400" onClick={openGmail}>
            <Mail className="mr-1 h-4 w-4" /> Open in Gmail
          </Button>
          <Button variant="secondary" size="sm" onClick={save}>
            <Save className="mr-1 h-4 w-4" /> Save Draft
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
