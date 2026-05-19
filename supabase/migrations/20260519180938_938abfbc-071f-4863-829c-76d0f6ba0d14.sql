
-- Remove orphan company_members rows that reference users no longer in profiles or auth
DELETE FROM public.company_members cm
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = cm.user_id);

-- Companies / company FKs
ALTER TABLE public.tms_projects        ADD CONSTRAINT tms_projects_company_fk        FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.tms_tasks           ADD CONSTRAINT tms_tasks_company_fk           FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.tms_task_statuses   ADD CONSTRAINT tms_task_statuses_company_fk   FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.tms_sprints         ADD CONSTRAINT tms_sprints_company_fk         FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.tms_milestones      ADD CONSTRAINT tms_milestones_company_fk      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.tms_labels          ADD CONSTRAINT tms_labels_company_fk          FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.tms_saved_views     ADD CONSTRAINT tms_saved_views_company_fk     FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Project FKs
ALTER TABLE public.tms_tasks           ADD CONSTRAINT tms_tasks_project_fk           FOREIGN KEY (project_id) REFERENCES public.tms_projects(id) ON DELETE SET NULL;
ALTER TABLE public.tms_task_statuses   ADD CONSTRAINT tms_task_statuses_project_fk   FOREIGN KEY (project_id) REFERENCES public.tms_projects(id) ON DELETE CASCADE;
ALTER TABLE public.tms_sprints         ADD CONSTRAINT tms_sprints_project_fk         FOREIGN KEY (project_id) REFERENCES public.tms_projects(id) ON DELETE CASCADE;
ALTER TABLE public.tms_milestones      ADD CONSTRAINT tms_milestones_project_fk      FOREIGN KEY (project_id) REFERENCES public.tms_projects(id) ON DELETE CASCADE;
ALTER TABLE public.tms_labels          ADD CONSTRAINT tms_labels_project_fk          FOREIGN KEY (project_id) REFERENCES public.tms_projects(id) ON DELETE CASCADE;
ALTER TABLE public.tms_project_members ADD CONSTRAINT tms_project_members_project_fk FOREIGN KEY (project_id) REFERENCES public.tms_projects(id) ON DELETE CASCADE;

-- Task FKs
ALTER TABLE public.tms_tasks                ADD CONSTRAINT tms_tasks_status_fk       FOREIGN KEY (status_id) REFERENCES public.tms_task_statuses(id) ON DELETE SET NULL;
ALTER TABLE public.tms_tasks                ADD CONSTRAINT tms_tasks_sprint_fk       FOREIGN KEY (sprint_id) REFERENCES public.tms_sprints(id) ON DELETE SET NULL;
ALTER TABLE public.tms_tasks                ADD CONSTRAINT tms_tasks_milestone_fk    FOREIGN KEY (milestone_id) REFERENCES public.tms_milestones(id) ON DELETE SET NULL;
ALTER TABLE public.tms_tasks                ADD CONSTRAINT tms_tasks_parent_fk       FOREIGN KEY (parent_task_id) REFERENCES public.tms_tasks(id) ON DELETE SET NULL;
ALTER TABLE public.tms_task_assignees       ADD CONSTRAINT tms_task_assignees_task_fk    FOREIGN KEY (task_id) REFERENCES public.tms_tasks(id) ON DELETE CASCADE;
ALTER TABLE public.tms_task_comments        ADD CONSTRAINT tms_task_comments_task_fk     FOREIGN KEY (task_id) REFERENCES public.tms_tasks(id) ON DELETE CASCADE;
ALTER TABLE public.tms_task_comments        ADD CONSTRAINT tms_task_comments_parent_fk   FOREIGN KEY (parent_comment_id) REFERENCES public.tms_task_comments(id) ON DELETE CASCADE;
ALTER TABLE public.tms_task_attachments     ADD CONSTRAINT tms_task_attachments_task_fk  FOREIGN KEY (task_id) REFERENCES public.tms_tasks(id) ON DELETE CASCADE;
ALTER TABLE public.tms_task_attachments     ADD CONSTRAINT tms_task_attachments_comment_fk FOREIGN KEY (comment_id) REFERENCES public.tms_task_comments(id) ON DELETE CASCADE;
ALTER TABLE public.tms_task_activity        ADD CONSTRAINT tms_task_activity_task_fk     FOREIGN KEY (task_id) REFERENCES public.tms_tasks(id) ON DELETE CASCADE;
ALTER TABLE public.tms_task_dependencies    ADD CONSTRAINT tms_task_deps_task_fk         FOREIGN KEY (task_id) REFERENCES public.tms_tasks(id) ON DELETE CASCADE;
ALTER TABLE public.tms_task_dependencies    ADD CONSTRAINT tms_task_deps_depends_fk      FOREIGN KEY (depends_on_task_id) REFERENCES public.tms_tasks(id) ON DELETE CASCADE;
ALTER TABLE public.tms_task_labels          ADD CONSTRAINT tms_task_labels_task_fk       FOREIGN KEY (task_id) REFERENCES public.tms_tasks(id) ON DELETE CASCADE;
ALTER TABLE public.tms_task_labels          ADD CONSTRAINT tms_task_labels_label_fk      FOREIGN KEY (label_id) REFERENCES public.tms_labels(id) ON DELETE CASCADE;
ALTER TABLE public.tms_checklist_items      ADD CONSTRAINT tms_checklist_task_fk         FOREIGN KEY (task_id) REFERENCES public.tms_tasks(id) ON DELETE CASCADE;
ALTER TABLE public.tms_time_logs            ADD CONSTRAINT tms_time_logs_task_fk         FOREIGN KEY (task_id) REFERENCES public.tms_tasks(id) ON DELETE CASCADE;
ALTER TABLE public.tms_comment_reactions    ADD CONSTRAINT tms_comment_reactions_comment_fk FOREIGN KEY (comment_id) REFERENCES public.tms_task_comments(id) ON DELETE CASCADE;

-- Profiles FKs
ALTER TABLE public.tms_projects            ADD CONSTRAINT tms_projects_owner_fk         FOREIGN KEY (owner_id)    REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.tms_projects            ADD CONSTRAINT tms_projects_created_by_fk    FOREIGN KEY (created_by)  REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.tms_project_members     ADD CONSTRAINT tms_project_members_user_fk   FOREIGN KEY (user_id)     REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.tms_tasks               ADD CONSTRAINT tms_tasks_created_by_fk       FOREIGN KEY (created_by)  REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.tms_task_assignees      ADD CONSTRAINT tms_task_assignees_user_fk    FOREIGN KEY (user_id)     REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.tms_task_comments       ADD CONSTRAINT tms_task_comments_author_fk   FOREIGN KEY (author_id)   REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.tms_task_attachments    ADD CONSTRAINT tms_task_attachments_user_fk  FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.tms_task_activity       ADD CONSTRAINT tms_task_activity_actor_fk    FOREIGN KEY (actor_id)    REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.tms_checklist_items     ADD CONSTRAINT tms_checklist_assignee_fk     FOREIGN KEY (assignee_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.tms_checklist_items     ADD CONSTRAINT tms_checklist_done_by_fk      FOREIGN KEY (done_by)     REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.tms_time_logs           ADD CONSTRAINT tms_time_logs_user_fk         FOREIGN KEY (user_id)     REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.tms_milestones          ADD CONSTRAINT tms_milestones_created_by_fk  FOREIGN KEY (created_by)  REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.tms_sprints             ADD CONSTRAINT tms_sprints_created_by_fk     FOREIGN KEY (created_by)  REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.tms_saved_views         ADD CONSTRAINT tms_saved_views_user_fk       FOREIGN KEY (user_id)     REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.tms_comment_reactions   ADD CONSTRAINT tms_comment_reactions_user_fk FOREIGN KEY (user_id)     REFERENCES public.profiles(id) ON DELETE CASCADE;

-- company_members ↔ profiles/companies
ALTER TABLE public.company_members         ADD CONSTRAINT company_members_user_fk       FOREIGN KEY (user_id)     REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.company_members         ADD CONSTRAINT company_members_company_fk    FOREIGN KEY (company_id)  REFERENCES public.companies(id) ON DELETE CASCADE;
