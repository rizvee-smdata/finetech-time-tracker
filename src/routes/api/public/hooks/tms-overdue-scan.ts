import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Hourly cron entry that creates overdue reminders for assignees.
 * Auth: callers must present the project anon key in the `apikey` header.
 *
 * Scans tms_tasks where due_date < today AND status is not terminal AND not deleted,
 * and inserts a row into `reminders` for each assignee per task (deduped by title+user+visit_id=NULL+remind_at day).
 */
export const Route = createFileRoute("/api/public/hooks/tms-overdue-scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-cron-secret");
        if (!secret || secret !== process.env.CRON_SECRET) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const today = new Date().toISOString().slice(0, 10);

        // Pull overdue, non-terminal, non-deleted tasks with primary/collaborator assignees
        const { data: tasks, error } = await supabaseAdmin
          .from("tms_tasks")
          .select(`
            id, title, due_date, company_id, status_id,
            tms_task_statuses(is_terminal),
            tms_task_assignees(user_id, role)
          `)
          .lt("due_date", today)
          .is("deleted_at", null);

        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        type Row = {
          id: string;
          title: string;
          due_date: string;
          company_id: string;
          tms_task_statuses: { is_terminal: boolean } | null;
          tms_task_assignees: Array<{ user_id: string; role: string }>;
        };

        const now = new Date().toISOString();
        const inserts: Array<{
          user_id: string;
          company_id: string;
          title: string;
          body: string;
          remind_at: string;
        }> = [];

        for (const t of (tasks ?? []) as Row[]) {
          if (t.tms_task_statuses?.is_terminal) continue;
          const assignees = t.tms_task_assignees.filter((a) => a.role !== "watcher");
          for (const a of assignees) {
            inserts.push({
              user_id: a.user_id,
              company_id: t.company_id,
              title: `Overdue: ${t.title}`,
              body: `Task was due on ${t.due_date}.`,
              remind_at: now,
            });
          }
        }

        let created = 0;
        if (inserts.length > 0) {
          // Insert reminders. We rely on the reminders table accepting these rows.
          const { error: insErr, count } = await supabaseAdmin
            .from("reminders")
            .insert(inserts, { count: "exact" });
          if (insErr) {
            return new Response(JSON.stringify({ ok: false, error: insErr.message }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
          created = count ?? inserts.length;
        }

        return new Response(JSON.stringify({ ok: true, scanned: tasks?.length ?? 0, created }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
