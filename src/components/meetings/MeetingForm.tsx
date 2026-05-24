import { useState, useRef, FormEvent, KeyboardEvent } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, X } from "lucide-react";

export type MeetingFormValues = {
  title: string;
  clientName: string;
  clientCompany: string;
  date: string;
  attendees: string[];
  rawNotes: string;
};

function toLocalDatetimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MeetingForm({ onSubmit }: { onSubmit: (v: MeetingFormValues) => void | Promise<void> }) {
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [date, setDate] = useState(toLocalDatetimeInput(new Date()));
  const [attendees, setAttendees] = useState<string[]>([]);
  const [attendeeInput, setAttendeeInput] = useState("");
  const [rawNotes, setRawNotes] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const addAttendee = () => {
    const v = attendeeInput.trim();
    if (!v) return;
    if (!attendees.includes(v)) setAttendees([...attendees, v]);
    setAttendeeInput("");
  };

  const onAttendeeKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addAttendee();
    } else if (e.key === "Backspace" && attendeeInput === "" && attendees.length > 0) {
      setAttendees(attendees.slice(0, -1));
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title || !clientName || !clientCompany || !rawNotes) return;
    onSubmit({ title, clientName, clientCompany, date, attendees, rawNotes });
  };

  const valid = title && clientName && clientCompany && rawNotes.length >= 10;

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <Card className="border-border/60 bg-card/60 backdrop-blur">
        <CardContent className="grid gap-4 p-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label htmlFor="title">Meeting Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. ERP renewal discovery" />
          </div>
          <div>
            <Label htmlFor="clientName">Client Name</Label>
            <Input id="clientName" value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="clientCompany">Client Company</Label>
            <Input id="clientCompany" value={clientCompany} onChange={(e) => setClientCompany(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="date">Date & Time</Label>
            <Input id="date" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="attendees">Attendees</Label>
            <div className="flex flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-2 py-1.5 shadow-sm">
              {attendees.map((a) => (
                <Badge key={a} variant="secondary" className="gap-1">
                  {a}
                  <button type="button" onClick={() => setAttendees(attendees.filter((x) => x !== a))}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <input
                id="attendees"
                value={attendeeInput}
                onChange={(e) => setAttendeeInput(e.target.value)}
                onKeyDown={onAttendeeKey}
                onBlur={addAttendee}
                placeholder="Type name and press Enter"
                className="flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/60 backdrop-blur">
        <CardContent className="space-y-3 p-5">
          <Label htmlFor="rawNotes">Raw Notes</Label>
          <Textarea
            id="rawNotes"
            value={rawNotes}
            onChange={(e) => setRawNotes(e.target.value)}
            placeholder="Paste your raw meeting notes here — bullet points, sentences, shorthand, any format works. AI will structure everything automatically."
            className="min-h-[220px] resize-y"
          />
          <div className="rounded-md border border-border/60 bg-accent/30 p-3 text-xs text-muted-foreground">
            <div className="mb-1 font-medium text-foreground">Tips for best results</div>
            <ul className="space-y-1">
              <li>✅ Include what the client said about their problems</li>
              <li>✅ Include any prices, timelines, or decisions mentioned</li>
              <li>✅ Include competitor names if mentioned</li>
              <li>✅ Include who is responsible for what</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          type="submit"
          size="lg"
          disabled={!valid}
          className="bg-amber-500 text-slate-950 hover:bg-amber-400"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Analyze Meeting with AI
        </Button>
      </div>
    </form>
  );
}
