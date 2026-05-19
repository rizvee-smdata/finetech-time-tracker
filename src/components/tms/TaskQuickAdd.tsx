import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { toast } from "sonner";

type Props = {
  projectId?: string | null;
  statusId?: string | null;
  sprintId?: string | null;
  invalidateKeys?: Array<readonly unknown[]>;
  placeholder?: string;
};

export function TaskQuickAdd({ projectId, statusId, sprintId, invalidateKeys, placeholder }: Props) {
  const { companyId, user } = useAuth();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");

  const create = useMutation({
    mutationFn: async (t: string) => {
      if (!companyId || !user?.id) throw new Error("No company selected");
      let useStatus = statusId ?? null;
      if (!useStatus) {
        const { data } = await supabase
          .from("tms_task_statuses")
          .select("id")
          .eq("company_id", companyId)
          .is("project_id", null)
          .order("sort_order")
          .limit(1)
          .maybeSingle();
        useStatus = data?.id ?? null;
      }
      if (!useStatus) throw new Error("No default status configured");
      const { data: inserted, error } = await supabase.from("tms_tasks").insert({
        company_id: companyId,
        title: t,
        priority: "medium",
        task_type: "task",
        status_id: useStatus,
        project_id: projectId ?? null,
        sprint_id: sprintId ?? null,
        created_by: user.id,
      }).select("id").single();
      if (error) throw error;
      // Auto-assign creator
      await supabase.from("tms_task_assignees").insert({
        task_id: inserted.id, user_id: user.id, role: "primary", assigned_by: user.id,
      });
    },
    onSuccess: () => {
      setTitle("");
      toast.success("Task added");
      (invalidateKeys ?? [["tms-tasks"]]).forEach((k) => qc.invalidateQueries({ queryKey: k }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const t = title.trim();
        if (t.length < 2) return;
        create.mutate(t);
      }}
      className="flex items-center gap-2"
    >
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder ?? "Quick add task… (press Enter)"}
        className="h-9"
      />
      <Button type="submit" size="sm" disabled={create.isPending || title.trim().length < 2}>
        <Plus className="size-4 mr-1" /> Add
      </Button>
    </form>
  );
}
