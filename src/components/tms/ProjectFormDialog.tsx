import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Visibility = Database["public"]["Enums"]["tms_project_visibility"];
type Status = Database["public"]["Enums"]["tms_project_status"];

export const PROJECT_TYPES = ["internal", "client", "product", "maintenance", "research", "other"] as const;

export type EditableProject = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  visibility: Visibility;
  status: Status;
  project_type?: string | null;
};

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  project?: EditableProject | null;
}) {
  const { companyId, user } = useAuth();
  const qc = useQueryClient();
  const isEdit = !!project;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [status, setStatus] = useState<Status>("active");
  const [projectType, setProjectType] = useState<string>("internal");
  // Optional first sprint (create mode only)
  const [sprintName, setSprintName] = useState("");
  const [sprintStart, setSprintStart] = useState("");
  const [sprintEnd, setSprintEnd] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? "");
    setDescription(project?.description ?? "");
    setColor(project?.color ?? "#6366f1");
    setVisibility(project?.visibility ?? "public");
    setStatus(project?.status ?? "active");
    setProjectType(project?.project_type ?? "internal");
    setSprintName(""); setSprintStart(""); setSprintEnd("");
  }, [open, project]);

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name required");
      if (!companyId || !user) throw new Error("No session");
      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        color,
        visibility,
        status,
        project_type: projectType,
      };
      if (isEdit) {
        const { error } = await supabase.from("tms_projects").update(payload as never).eq("id", project!.id);
        if (error) throw error;
        return;
      }
      const { data, error } = await supabase
        .from("tms_projects")
        .insert({ ...payload, company_id: companyId, owner_id: user.id, created_by: user.id } as never)
        .select("id")
        .single();
      if (error) throw error;
      if (sprintName.trim()) {
        const { error: sErr } = await supabase.from("tms_sprints").insert({
          company_id: companyId,
          project_id: (data as { id: string }).id,
          name: sprintName.trim(),
          start_date: sprintStart || null,
          end_date: sprintEnd || null,
        });
        if (sErr) throw sErr;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Project updated" : "Project created");
      qc.invalidateQueries({ queryKey: ["tms-projects"] });
      qc.invalidateQueries({ queryKey: ["tms-project"] });
      qc.invalidateQueries({ queryKey: ["tms-sprints"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Edit project" : "New project"}</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="grid gap-1.5">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label>Description</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select value={projectType} onValueChange={setProjectType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJECT_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Color</Label>
              <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 p-1" />
            </div>
            <div className="grid gap-1.5">
              <Label>Visibility</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as Visibility)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="restricted">Restricted</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_hold">On hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {!isEdit && (
            <div className="rounded-md border p-3 space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">First sprint (optional)</Label>
              <Input placeholder="Sprint name" value={sprintName} onChange={(e) => setSprintName(e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <Input type="date" value={sprintStart} onChange={(e) => setSprintStart(e.target.value)} />
                <Input type="date" value={sprintEnd} onChange={(e) => setSprintEnd(e.target.value)} />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : isEdit ? "Save changes" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
