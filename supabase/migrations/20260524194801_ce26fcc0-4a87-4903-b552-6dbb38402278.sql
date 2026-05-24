ALTER TABLE public.customer_visits
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS ai_sentiment text,
  ADD COLUMN IF NOT EXISTS ai_pain_points jsonb,
  ADD COLUMN IF NOT EXISTS ai_next_steps jsonb,
  ADD COLUMN IF NOT EXISTS ai_action_items jsonb,
  ADD COLUMN IF NOT EXISTS ai_follow_up_subject text,
  ADD COLUMN IF NOT EXISTS ai_follow_up_email text,
  ADD COLUMN IF NOT EXISTS ai_analyzed_at timestamptz;