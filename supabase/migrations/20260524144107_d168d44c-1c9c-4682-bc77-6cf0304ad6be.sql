
-- Module 9: Notification Center — enrich reminders with type/category and link
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_category') THEN
    CREATE TYPE public.notification_category AS ENUM (
      'general','lead','quote','contract','payment','task','visit','attendance','expense','survey','target','system'
    );
  END IF;
END $$;

ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS category public.notification_category NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS link_url text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_reminders_user_unread
  ON public.reminders(user_id, read_at) WHERE read_at IS NULL AND dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reminders_category ON public.reminders(category);

-- Per-user channel preferences (in-app / email / push toggles per category)
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  in_app jsonb NOT NULL DEFAULT '{}'::jsonb,
  email  jsonb NOT NULL DEFAULT '{}'::jsonb,
  push   jsonb NOT NULL DEFAULT '{}'::jsonb,
  quiet_hours_start time,
  quiet_hours_end   time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own prefs" ON public.notification_preferences;
CREATE POLICY "Users view own prefs" ON public.notification_preferences
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users insert own prefs" ON public.notification_preferences;
CREATE POLICY "Users insert own prefs" ON public.notification_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own prefs" ON public.notification_preferences;
CREATE POLICY "Users update own prefs" ON public.notification_preferences
  FOR UPDATE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS notification_prefs_touch ON public.notification_preferences;
CREATE TRIGGER notification_prefs_touch BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable realtime so the bell updates live
ALTER TABLE public.reminders REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reminders;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
