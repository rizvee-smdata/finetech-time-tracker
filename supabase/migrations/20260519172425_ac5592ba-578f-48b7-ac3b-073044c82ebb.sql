-- ============================================================
-- TMS Module (adapted to companies/profiles/user_roles schema)
-- ============================================================

-- 1. ENUMS ---------------------------------------------------
CREATE TYPE public.tms_priority AS ENUM ('critical','high','medium','low');
CREATE TYPE public.tms_task_type AS ENUM ('task','bug','story','milestone');
CREATE TYPE public.tms_project_status AS ENUM ('planning','active','on_hold','completed','archived');
CREATE TYPE public.tms_project_visibility AS ENUM ('public','restricted','private');
CREATE TYPE public.tms_project_member_role AS ENUM ('manager','member','viewer');
CREATE TYPE public.tms_assignee_role AS ENUM ('primary','collaborator','watcher');
CREATE TYPE public.tms_dependency_type AS ENUM ('blocks','is_blocked_by','relates_to','duplicates');

-- 2. TABLES --------------------------------------------------

CREATE TABLE public.tms_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  owner_id uuid NOT NULL,
  status public.tms_project_status NOT NULL DEFAULT 'planning',
  visibility public.tms_project_visibility NOT NULL DEFAULT 'public',
  start_date date,
  end_date date,
  budget_hours numeric(10,2),
  color text DEFAULT '#6366f1',
  icon text,
  archived_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
CREATE INDEX idx_tms_projects_company ON public.tms_projects (company_id, status);
CREATE INDEX idx_tms_projects_owner ON public.tms_projects (owner_id);

CREATE TABLE public.tms_project_members (
  project_id uuid NOT NULL REFERENCES public.tms_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.tms_project_member_role NOT NULL DEFAULT 'member',
  added_by uuid,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE public.tms_task_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.tms_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#94a3b8',
  is_terminal boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  wip_limit integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tms_status_company ON public.tms_task_statuses (company_id, project_id, sort_order);

CREATE TABLE public.tms_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.tms_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  target_date date,
  completed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tms_sprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.tms_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  goal text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  capacity_hours numeric(10,2),
  closed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tms_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.tms_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#64748b',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, project_id, name)
);

CREATE TABLE public.tms_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) <= 255),
  description text,
  task_type public.tms_task_type NOT NULL DEFAULT 'task',
  priority public.tms_priority NOT NULL DEFAULT 'medium',
  status_id uuid REFERENCES public.tms_task_statuses(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.tms_projects(id) ON DELETE SET NULL,
  sprint_id uuid REFERENCES public.tms_sprints(id) ON DELETE SET NULL,
  parent_task_id uuid REFERENCES public.tms_tasks(id) ON DELETE CASCADE,
  milestone_id uuid REFERENCES public.tms_milestones(id) ON DELETE SET NULL,
  created_by uuid,
  due_date date,
  estimated_hours numeric(8,2),
  logged_hours numeric(10,2) NOT NULL DEFAULT 0,
  is_recurring boolean NOT NULL DEFAULT false,
  recurrence_rule text,
  recurrence_end_date date,
  recurrence_count integer,
  is_private boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX idx_tms_tasks_company_status ON public.tms_tasks (company_id, status_id, due_date);
CREATE INDEX idx_tms_tasks_project ON public.tms_tasks (project_id, status_id);
CREATE INDEX idx_tms_tasks_sprint ON public.tms_tasks (sprint_id);
CREATE INDEX idx_tms_tasks_parent ON public.tms_tasks (parent_task_id);
CREATE INDEX idx_tms_tasks_due ON public.tms_tasks (due_date) WHERE deleted_at IS NULL;

CREATE TABLE public.tms_task_assignees (
  task_id uuid NOT NULL REFERENCES public.tms_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.tms_assignee_role NOT NULL DEFAULT 'primary',
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX idx_tms_assignees_user ON public.tms_task_assignees (user_id);

CREATE TABLE public.tms_task_labels (
  task_id uuid NOT NULL REFERENCES public.tms_tasks(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES public.tms_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);

CREATE TABLE public.tms_task_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tms_tasks(id) ON DELETE CASCADE,
  depends_on_task_id uuid NOT NULL REFERENCES public.tms_tasks(id) ON DELETE CASCADE,
  dependency_type public.tms_dependency_type NOT NULL DEFAULT 'is_blocked_by',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, depends_on_task_id, dependency_type),
  CHECK (task_id <> depends_on_task_id)
);

CREATE TABLE public.tms_task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tms_tasks(id) ON DELETE CASCADE,
  comment_id uuid,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint,
  content_type text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tms_task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tms_tasks(id) ON DELETE CASCADE,
  parent_comment_id uuid REFERENCES public.tms_task_comments(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tms_comments_task ON public.tms_task_comments (task_id, created_at);

CREATE TABLE public.tms_comment_reactions (
  comment_id uuid NOT NULL REFERENCES public.tms_task_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id, emoji)
);

CREATE TABLE public.tms_time_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tms_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  hours numeric(5,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tms_time_logs_task ON public.tms_time_logs (task_id, log_date);
CREATE INDEX idx_tms_time_logs_user ON public.tms_time_logs (user_id, log_date);

CREATE TABLE public.tms_task_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tms_tasks(id) ON DELETE CASCADE,
  actor_id uuid,
  event_type text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tms_activity_task ON public.tms_task_activity (task_id, created_at DESC);

CREATE TABLE public.tms_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tms_tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  assignee_id uuid,
  due_date date,
  done_at timestamptz,
  done_by uuid,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tms_check_task ON public.tms_checklist_items (task_id, sort_order);

CREATE TABLE public.tms_notification_prefs (
  user_id uuid NOT NULL,
  category text NOT NULL,
  in_app boolean NOT NULL DEFAULT true,
  email boolean NOT NULL DEFAULT true,
  digest_mode text NOT NULL DEFAULT 'immediate',
  muted_project_ids uuid[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category)
);

CREATE TABLE public.tms_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  view_type text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_shared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tms_views_user ON public.tms_saved_views (user_id, view_type);

-- 3. HELPER FUNCTIONS ----------------------------------------

CREATE OR REPLACE FUNCTION public.tms_can_view_project(_user uuid, _project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tms_projects p
    LEFT JOIN public.tms_project_members m ON m.project_id = p.id AND m.user_id = _user
    WHERE p.id = _project
      AND (
        public.has_role(_user, 'admin'::app_role)
        OR p.owner_id = _user
        OR (p.visibility = 'public' AND public.is_company_member(_user, p.company_id))
        OR (p.visibility = 'restricted' AND m.user_id IS NOT NULL)
        OR (p.visibility = 'private' AND m.user_id IS NOT NULL AND m.role = 'manager')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.tms_can_manage_project(_user uuid, _project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tms_projects p
    LEFT JOIN public.tms_project_members m ON m.project_id = p.id AND m.user_id = _user AND m.role = 'manager'
    WHERE p.id = _project
      AND (public.has_role(_user, 'admin'::app_role) OR p.owner_id = _user OR m.user_id IS NOT NULL)
  );
$$;

CREATE OR REPLACE FUNCTION public.tms_can_view_task(_user uuid, _task_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tms_tasks t
    WHERE t.id = _task_id
      AND public.is_company_member(_user, t.company_id)
      AND (
        NOT t.is_private
        OR t.created_by = _user
        OR public.has_role(_user, 'admin'::app_role)
        OR EXISTS (
          SELECT 1 FROM public.tms_task_assignees a
          WHERE a.task_id = t.id AND a.user_id = _user
        )
      )
  );
$$;

-- 4. RLS + POLICIES ------------------------------------------

ALTER TABLE public.tms_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tms_projects_select" ON public.tms_projects FOR SELECT TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id) AND (
      visibility = 'public'
      OR owner_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (SELECT 1 FROM public.tms_project_members m WHERE m.project_id = id AND m.user_id = auth.uid())
    )
  );
CREATE POLICY "tms_projects_insert" ON public.tms_projects FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "tms_projects_update" ON public.tms_projects FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "tms_projects_delete" ON public.tms_projects FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.tms_project_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tms_pm_select" ON public.tms_project_members FOR SELECT TO authenticated
  USING (public.tms_can_view_project(auth.uid(), project_id));
CREATE POLICY "tms_pm_manage" ON public.tms_project_members FOR ALL TO authenticated
  USING (public.tms_can_manage_project(auth.uid(), project_id))
  WITH CHECK (public.tms_can_manage_project(auth.uid(), project_id));

ALTER TABLE public.tms_task_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tms_status_select" ON public.tms_task_statuses FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "tms_status_manage" ON public.tms_task_statuses FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (project_id IS NOT NULL AND public.tms_can_manage_project(auth.uid(), project_id))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (project_id IS NOT NULL AND public.tms_can_manage_project(auth.uid(), project_id))
  );

ALTER TABLE public.tms_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tms_milestones_select" ON public.tms_milestones FOR SELECT TO authenticated
  USING (public.tms_can_view_project(auth.uid(), project_id));
CREATE POLICY "tms_milestones_manage" ON public.tms_milestones FOR ALL TO authenticated
  USING (public.tms_can_manage_project(auth.uid(), project_id))
  WITH CHECK (public.tms_can_manage_project(auth.uid(), project_id));

ALTER TABLE public.tms_sprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tms_sprints_select" ON public.tms_sprints FOR SELECT TO authenticated
  USING (public.tms_can_view_project(auth.uid(), project_id));
CREATE POLICY "tms_sprints_manage" ON public.tms_sprints FOR ALL TO authenticated
  USING (public.tms_can_manage_project(auth.uid(), project_id))
  WITH CHECK (public.tms_can_manage_project(auth.uid(), project_id));

ALTER TABLE public.tms_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tms_labels_select" ON public.tms_labels FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "tms_labels_manage" ON public.tms_labels FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

ALTER TABLE public.tms_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tms_tasks_select" ON public.tms_tasks FOR SELECT TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id) AND (
      NOT is_private
      OR created_by = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (SELECT 1 FROM public.tms_task_assignees a WHERE a.task_id = id AND a.user_id = auth.uid())
    )
  );
CREATE POLICY "tms_tasks_insert" ON public.tms_tasks FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "tms_tasks_update" ON public.tms_tasks FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR created_by = auth.uid()
         OR EXISTS (SELECT 1 FROM public.tms_task_assignees a WHERE a.task_id = id AND a.user_id = auth.uid()));
CREATE POLICY "tms_tasks_delete" ON public.tms_tasks FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR created_by = auth.uid());

ALTER TABLE public.tms_task_assignees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tms_assignees_select" ON public.tms_task_assignees FOR SELECT TO authenticated
  USING (public.tms_can_view_task(auth.uid(), task_id));
CREATE POLICY "tms_assignees_manage" ON public.tms_task_assignees FOR ALL TO authenticated
  USING (public.tms_can_view_task(auth.uid(), task_id))
  WITH CHECK (public.tms_can_view_task(auth.uid(), task_id));

ALTER TABLE public.tms_task_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tms_task_labels_select" ON public.tms_task_labels FOR SELECT TO authenticated
  USING (public.tms_can_view_task(auth.uid(), task_id));
CREATE POLICY "tms_task_labels_manage" ON public.tms_task_labels FOR ALL TO authenticated
  USING (public.tms_can_view_task(auth.uid(), task_id))
  WITH CHECK (public.tms_can_view_task(auth.uid(), task_id));

ALTER TABLE public.tms_task_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tms_deps_select" ON public.tms_task_dependencies FOR SELECT TO authenticated
  USING (public.tms_can_view_task(auth.uid(), task_id));
CREATE POLICY "tms_deps_manage" ON public.tms_task_dependencies FOR ALL TO authenticated
  USING (public.tms_can_view_task(auth.uid(), task_id))
  WITH CHECK (public.tms_can_view_task(auth.uid(), task_id));

ALTER TABLE public.tms_task_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tms_att_select" ON public.tms_task_attachments FOR SELECT TO authenticated
  USING (public.tms_can_view_task(auth.uid(), task_id));
CREATE POLICY "tms_att_manage" ON public.tms_task_attachments FOR ALL TO authenticated
  USING (public.tms_can_view_task(auth.uid(), task_id))
  WITH CHECK (public.tms_can_view_task(auth.uid(), task_id));

ALTER TABLE public.tms_task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tms_comments_select" ON public.tms_task_comments FOR SELECT TO authenticated
  USING (public.tms_can_view_task(auth.uid(), task_id));
CREATE POLICY "tms_comments_insert" ON public.tms_task_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.tms_can_view_task(auth.uid(), task_id));
CREATE POLICY "tms_comments_update" ON public.tms_task_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid());
CREATE POLICY "tms_comments_delete" ON public.tms_task_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.tms_comment_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tms_react_select" ON public.tms_comment_reactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "tms_react_manage" ON public.tms_comment_reactions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE public.tms_time_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tms_time_select" ON public.tms_time_logs FOR SELECT TO authenticated
  USING (public.tms_can_view_task(auth.uid(), task_id));
CREATE POLICY "tms_time_insert" ON public.tms_time_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.tms_can_view_task(auth.uid(), task_id));
CREATE POLICY "tms_time_update" ON public.tms_time_logs FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "tms_time_delete" ON public.tms_time_logs FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.tms_task_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tms_activity_select" ON public.tms_task_activity FOR SELECT TO authenticated
  USING (public.tms_can_view_task(auth.uid(), task_id));
CREATE POLICY "tms_activity_insert" ON public.tms_task_activity FOR INSERT TO authenticated
  WITH CHECK (public.tms_can_view_task(auth.uid(), task_id));

ALTER TABLE public.tms_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tms_check_select" ON public.tms_checklist_items FOR SELECT TO authenticated
  USING (public.tms_can_view_task(auth.uid(), task_id));
CREATE POLICY "tms_check_manage" ON public.tms_checklist_items FOR ALL TO authenticated
  USING (public.tms_can_view_task(auth.uid(), task_id))
  WITH CHECK (public.tms_can_view_task(auth.uid(), task_id));

ALTER TABLE public.tms_notification_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tms_prefs_select" ON public.tms_notification_prefs FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "tms_prefs_manage" ON public.tms_notification_prefs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE public.tms_saved_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tms_views_select" ON public.tms_saved_views FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (is_shared AND public.is_company_member(auth.uid(), company_id)));
CREATE POLICY "tms_views_manage" ON public.tms_saved_views FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 5. TRIGGERS ------------------------------------------------

CREATE TRIGGER trg_tms_projects_upd BEFORE UPDATE ON public.tms_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tms_milestones_upd BEFORE UPDATE ON public.tms_milestones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tms_sprints_upd BEFORE UPDATE ON public.tms_sprints
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tms_tasks_upd BEFORE UPDATE ON public.tms_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tms_comments_upd BEFORE UPDATE ON public.tms_task_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tms_check_upd BEFORE UPDATE ON public.tms_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.tms_recalc_logged_hours()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _task uuid;
BEGIN
  _task := COALESCE(NEW.task_id, OLD.task_id);
  UPDATE public.tms_tasks
    SET logged_hours = COALESCE((SELECT SUM(hours) FROM public.tms_time_logs WHERE task_id = _task), 0)
    WHERE id = _task;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_tms_recalc_hours
AFTER INSERT OR UPDATE OR DELETE ON public.tms_time_logs
FOR EACH ROW EXECUTE FUNCTION public.tms_recalc_logged_hours();

CREATE OR REPLACE FUNCTION public.tms_log_task_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.tms_task_activity (task_id, actor_id, event_type, payload)
    VALUES (NEW.id, auth.uid(), 'task_created', jsonb_build_object('title', NEW.title));
    RETURN NEW;
  END IF;
  IF NEW.status_id IS DISTINCT FROM OLD.status_id THEN
    INSERT INTO public.tms_task_activity (task_id, actor_id, event_type, payload)
    VALUES (NEW.id, auth.uid(), 'status_changed', jsonb_build_object('from', OLD.status_id, 'to', NEW.status_id));
  END IF;
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO public.tms_task_activity (task_id, actor_id, event_type, payload)
    VALUES (NEW.id, auth.uid(), 'priority_changed', jsonb_build_object('from', OLD.priority, 'to', NEW.priority));
  END IF;
  IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    INSERT INTO public.tms_task_activity (task_id, actor_id, event_type, payload)
    VALUES (NEW.id, auth.uid(), 'due_date_changed', jsonb_build_object('from', OLD.due_date, 'to', NEW.due_date));
  END IF;
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at AND NEW.deleted_at IS NOT NULL THEN
    INSERT INTO public.tms_task_activity (task_id, actor_id, event_type, payload)
    VALUES (NEW.id, auth.uid(), 'task_deleted', '{}'::jsonb);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_tms_task_activity
AFTER INSERT OR UPDATE ON public.tms_tasks
FOR EACH ROW EXECUTE FUNCTION public.tms_log_task_activity();

CREATE OR REPLACE FUNCTION public.tms_sync_completed_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _is_terminal boolean;
BEGIN
  IF NEW.status_id IS DISTINCT FROM OLD.status_id THEN
    SELECT is_terminal INTO _is_terminal FROM public.tms_task_statuses WHERE id = NEW.status_id;
    IF _is_terminal THEN
      NEW.completed_at := COALESCE(NEW.completed_at, now());
    ELSE
      NEW.completed_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_tms_completed_at
BEFORE UPDATE ON public.tms_tasks
FOR EACH ROW EXECUTE FUNCTION public.tms_sync_completed_at();

-- 6. SEED STATUSES -------------------------------------------

INSERT INTO public.tms_task_statuses (company_id, project_id, name, color, is_terminal, sort_order)
SELECT c.id, NULL, s.name, s.color, s.is_terminal, s.sort_order
FROM public.companies c
CROSS JOIN (VALUES
  ('To Do',       '#94a3b8', false, 1),
  ('In Progress', '#3b82f6', false, 2),
  ('In Review',   '#f59e0b', false, 3),
  ('Done',        '#10b981', true,  4),
  ('Cancelled',   '#ef4444', true,  5)
) AS s(name, color, is_terminal, sort_order);

CREATE OR REPLACE FUNCTION public.tms_seed_statuses_for_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.tms_task_statuses (company_id, project_id, name, color, is_terminal, sort_order)
  VALUES
    (NEW.id, NULL, 'To Do',       '#94a3b8', false, 1),
    (NEW.id, NULL, 'In Progress', '#3b82f6', false, 2),
    (NEW.id, NULL, 'In Review',   '#f59e0b', false, 3),
    (NEW.id, NULL, 'Done',        '#10b981', true,  4),
    (NEW.id, NULL, 'Cancelled',   '#ef4444', true,  5);
  RETURN NEW;
END $$;

CREATE TRIGGER trg_tms_seed_statuses
AFTER INSERT ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.tms_seed_statuses_for_company();

-- 7. STORAGE BUCKET ------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('tms-attachments', 'tms-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "tms_att_storage_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tms-attachments');
CREATE POLICY "tms_att_storage_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tms-attachments' AND owner = auth.uid());
CREATE POLICY "tms_att_storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tms-attachments' AND owner = auth.uid());