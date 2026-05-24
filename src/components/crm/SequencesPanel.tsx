import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, MessageSquare, Phone, Clock, Play, Pause, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { format, addDays } from "date-fns";

const sb = supabase as any;

type Enrollment = {
  id: string;
  sequence_id: string;
  lead_id: string;
  status: string;
  current_step: number;
  enrolled_at: string;
  completed_at: string | null;
  crm_sequences?: { id: string; name: string; description: string | null } | null;
};

type Sequence = { id: string; name: string; description: string | null };
type Step = {
  id: string;
  step_order: number;
  day_offset: number;
  channel: string;
  template_id: string | null;
  subject: string | null;
  body: string | null;
};

const channelIcon = (c: string) => {
  if (c === "email") return Mail;
  if (c === "call") return Phone;
  return MessageSquare;
};

export function SequencesPanel({ leadId, companyId, userId }: { leadId: string; companyId: string; userId: string | null }) {
  const qc = useQueryClient();
  const [picking, setPicking] = useState("");

  const enrollmentsQ = useQuery({
    queryKey: ["crm-lead-enrollments", leadId],
    queryFn: async () => {
      const { data, error } = await sb
        .from("crm_sequence_enrollments")
        .select("*, crm_sequences(id,name,description)")
        .eq("lead_id", leadId)
        .order("enrolled_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Enrollment[];
    },
  });

  const sequencesQ = useQuery({
    queryKey: ["crm-sequences-active", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await sb
        .from("crm_sequences")
        .select("id,name,description")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      return (data ?? []) as Sequence[];
    },
  });

  async function enroll() {
    if (!picking) return;
    const { error } = await sb.from("crm_sequence_enrollments").insert({
      sequence_id: picking,
      lead_id: leadId,
      enrolled_by: userId,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Lead enrolled");
      setPicking("");
      qc.invalidateQueries({ queryKey: ["crm-lead-enrollments", leadId] });
    }
  }

  async function updateStatus(id: string, status: string, extra: Partial<Enrollment> = {}) {
    const { error } = await sb.from("crm_sequence_enrollments").update({ status, ...extra }).eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["crm-lead-enrollments", leadId] });
  }

  async function advance(enr: Enrollment, totalSteps: number) {
    const next = enr.current_step + 1;
    if (next >= totalSteps) {
      await updateStatus(enr.id, "completed", { current_step: next, completed_at: new Date().toISOString() } as any);
      toast.success("Sequence completed");
    } else {
      const { error } = await sb.from("crm_sequence_enrollments").update({ current_step: next }).eq("id", enr.id);
      if (error) toast.error(error.message);
      else {
        toast.success(`Advanced to step ${next + 1}`);
        qc.invalidateQueries({ queryKey: ["crm-lead-enrollments", leadId] });
      }
    }
  }

  const enrollments = enrollmentsQ.data ?? [];
  const sequences = sequencesQ.data ?? [];
  const available = sequences.filter((s) => !enrollments.some((e) => e.sequence_id === s.id && e.status === "active"));

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Enroll in sequence</label>
            <Select value={picking} onValueChange={setPicking}>
              <SelectTrigger><SelectValue placeholder={available.length ? "Choose a sequence…" : "No available sequences"} /></SelectTrigger>
              <SelectContent>
                {available.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={enroll} disabled={!picking}>Enroll</Button>
        </div>
      </Card>

      {enrollments.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground text-center">
          This lead isn't in any sequences yet.
        </Card>
      ) : (
        enrollments.map((e) => <EnrollmentCard key={e.id} enrollment={e} onUpdate={updateStatus} onAdvance={advance} />)
      )}
    </div>
  );
}

function EnrollmentCard({
  enrollment, onUpdate, onAdvance,
}: {
  enrollment: Enrollment;
  onUpdate: (id: string, status: string, extra?: any) => void;
  onAdvance: (enr: Enrollment, totalSteps: number) => void;
}) {
  const stepsQ = useQuery({
    queryKey: ["crm-seq-steps", enrollment.sequence_id],
    queryFn: async () => {
      const { data } = await sb
        .from("crm_sequence_steps")
        .select("*")
        .eq("sequence_id", enrollment.sequence_id)
        .order("step_order");
      return (data ?? []) as Step[];
    },
  });

  const steps = stepsQ.data ?? [];
  const enrolledAt = new Date(enrollment.enrolled_at);
  const statusColor: Record<string, string> = {
    active: "bg-primary/10 text-primary border-primary/20",
    paused: "bg-muted text-muted-foreground",
    completed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    cancelled: "bg-muted text-muted-foreground line-through",
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-medium">{enrollment.crm_sequences?.name ?? "Sequence"}</h4>
            <Badge variant="outline" className={statusColor[enrollment.status]}>{enrollment.status}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Enrolled {format(enrolledAt, "MMM d, yyyy")} · Step {Math.min(enrollment.current_step + 1, steps.length || 1)} of {steps.length}
          </p>
        </div>
        <div className="flex gap-1">
          {enrollment.status === "active" && (
            <Button size="sm" variant="outline" onClick={() => onUpdate(enrollment.id, "paused")}>
              <Pause className="h-3 w-3 mr-1" />Pause
            </Button>
          )}
          {enrollment.status === "paused" && (
            <Button size="sm" variant="outline" onClick={() => onUpdate(enrollment.id, "active")}>
              <Play className="h-3 w-3 mr-1" />Resume
            </Button>
          )}
          {enrollment.status !== "cancelled" && enrollment.status !== "completed" && (
            <Button size="sm" variant="ghost" onClick={() => onUpdate(enrollment.id, "cancelled")}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        {steps.map((step, i) => {
          const Icon = channelIcon(step.channel);
          const done = i < enrollment.current_step || enrollment.status === "completed";
          const current = i === enrollment.current_step && enrollment.status === "active";
          const dueDate = addDays(enrolledAt, step.day_offset);
          return (
            <div
              key={step.id}
              className={`flex items-center gap-3 p-2 rounded-md text-sm border ${current ? "border-primary bg-primary/5" : "border-transparent"}`}
            >
              <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-emerald-500/10 text-emerald-600" : current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{step.subject || (step.channel === "call" ? "Call lead" : `${step.channel} touch`)}</span>
                  <Badge variant="outline" className="text-[10px] h-4 px-1">{step.channel}</Badge>
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Day {step.day_offset} · {format(dueDate, "MMM d")}
                </div>
              </div>
              {current && (
                <Button size="sm" variant="outline" onClick={() => onAdvance(enrollment, steps.length)}>
                  Mark done
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
