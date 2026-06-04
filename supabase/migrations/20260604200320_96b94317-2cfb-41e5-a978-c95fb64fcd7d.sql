
-- =========================================================
-- Internal Chat & Team Feed
-- =========================================================

CREATE TYPE public.chat_channel_kind AS ENUM ('channel','dm','system');

CREATE TABLE public.chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT,
  kind public.chat_channel_kind NOT NULL DEFAULT 'channel',
  is_announcement BOOLEAN NOT NULL DEFAULT false,
  is_system BOOLEAN NOT NULL DEFAULT false,
  topic TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX chat_channels_company_slug_uniq
  ON public.chat_channels(company_id, slug) WHERE slug IS NOT NULL;
CREATE INDEX chat_channels_company_idx ON public.chat_channels(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_channels TO authenticated;
GRANT ALL ON public.chat_channels TO service_role;
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.chat_channel_members (
  channel_id UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  muted BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (channel_id, user_id)
);
CREATE INDEX chat_channel_members_user_idx ON public.chat_channel_members(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_channel_members TO authenticated;
GRANT ALL ON public.chat_channel_members TO service_role;
ALTER TABLE public.chat_channel_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sender_id UUID,
  body TEXT NOT NULL DEFAULT '',
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  mentions UUID[] NOT NULL DEFAULT '{}',
  parent_id UUID REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_system BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX chat_messages_channel_idx ON public.chat_messages(channel_id, created_at DESC);
CREATE INDEX chat_messages_parent_idx ON public.chat_messages(parent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.chat_reactions (
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);
CREATE INDEX chat_reactions_message_idx ON public.chat_reactions(message_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_reactions TO authenticated;
GRANT ALL ON public.chat_reactions TO service_role;
ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- Helper: can user access a channel?
-- =========================================================
CREATE OR REPLACE FUNCTION public.chat_can_access_channel(_user uuid, _channel uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_channels c
    WHERE c.id = _channel
      AND public.is_company_member(_user, c.company_id)
      AND (
        c.kind = 'channel'
        OR EXISTS (
          SELECT 1 FROM public.chat_channel_members m
          WHERE m.channel_id = c.id AND m.user_id = _user
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.chat_is_channel_member(_user uuid, _channel uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_channel_members
    WHERE channel_id = _channel AND user_id = _user
  );
$$;

-- =========================================================
-- RLS Policies
-- =========================================================

-- chat_channels: visible to all company members; staff create; creator/admin update
CREATE POLICY "chat_channels_select"
  ON public.chat_channels FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (kind <> 'dm' AND is_company_member(auth.uid(), company_id))
    OR (kind = 'dm' AND EXISTS (
      SELECT 1 FROM public.chat_channel_members m
      WHERE m.channel_id = id AND m.user_id = auth.uid()
    ))
  );

CREATE POLICY "chat_channels_insert"
  ON public.chat_channels FOR INSERT TO authenticated
  WITH CHECK (
    is_company_member(auth.uid(), company_id)
    AND created_by = auth.uid()
  );

CREATE POLICY "chat_channels_update"
  ON public.chat_channels FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_staff(auth.uid())
    OR created_by = auth.uid()
  );

CREATE POLICY "chat_channels_delete"
  ON public.chat_channels FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- chat_channel_members
CREATE POLICY "chat_members_select"
  ON public.chat_channel_members FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.chat_can_access_channel(auth.uid(), channel_id)
  );

CREATE POLICY "chat_members_insert"
  ON public.chat_channel_members FOR INSERT TO authenticated
  WITH CHECK (
    -- user adds self to a company channel, OR staff adds anyone
    (user_id = auth.uid() AND public.chat_can_access_channel(auth.uid(), channel_id))
    OR is_staff(auth.uid())
  );

CREATE POLICY "chat_members_update"
  ON public.chat_channel_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR is_staff(auth.uid()));

CREATE POLICY "chat_members_delete"
  ON public.chat_channel_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR is_staff(auth.uid()));

-- chat_messages
CREATE POLICY "chat_messages_select"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (public.chat_can_access_channel(auth.uid(), channel_id));

CREATE POLICY "chat_messages_insert"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.chat_can_access_channel(auth.uid(), channel_id)
    AND (
      -- announcement channels: staff only
      NOT EXISTS (
        SELECT 1 FROM public.chat_channels c
        WHERE c.id = channel_id AND c.is_announcement = true
      )
      OR is_staff(auth.uid())
    )
  );

CREATE POLICY "chat_messages_update"
  ON public.chat_messages FOR UPDATE TO authenticated
  USING (
    sender_id = auth.uid()
    OR is_staff(auth.uid())
  );

CREATE POLICY "chat_messages_delete"
  ON public.chat_messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid() OR is_staff(auth.uid()));

-- chat_reactions
CREATE POLICY "chat_reactions_select"
  ON public.chat_reactions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.chat_messages m
    WHERE m.id = message_id
      AND public.chat_can_access_channel(auth.uid(), m.channel_id)
  ));

CREATE POLICY "chat_reactions_insert"
  ON public.chat_reactions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_messages m
      WHERE m.id = message_id
        AND public.chat_can_access_channel(auth.uid(), m.channel_id)
    )
  );

CREATE POLICY "chat_reactions_delete"
  ON public.chat_reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- =========================================================
-- Updated-at triggers
-- =========================================================
CREATE TRIGGER chat_channels_touch BEFORE UPDATE ON public.chat_channels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER chat_messages_touch BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- Seed default channels for a company (called on demand)
-- =========================================================
CREATE OR REPLACE FUNCTION public.chat_ensure_default_channels(_company uuid, _actor uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.chat_channels (company_id, name, slug, kind, is_announcement, is_system, created_by, topic)
  VALUES
    (_company, 'General', 'general', 'channel', false, true, _actor, 'Team-wide conversation'),
    (_company, 'Announcements', 'announcements', 'channel', true, true, _actor, 'Manager announcements'),
    (_company, 'Sales Wins', 'sales-wins', 'channel', false, true, _actor, 'Celebrate every deal won')
  ON CONFLICT (company_id, slug) WHERE slug IS NOT NULL DO NOTHING;
END $$;

-- =========================================================
-- Sales Wins auto-post trigger
-- =========================================================
CREATE OR REPLACE FUNCTION public.chat_post_sales_win()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _channel_id uuid;
  _rep_name text;
  _amount text;
  _body text;
BEGIN
  IF NEW.stage <> 'won' OR (TG_OP = 'UPDATE' AND OLD.stage = 'won') THEN
    RETURN NEW;
  END IF;

  -- Ensure sales-wins channel exists
  SELECT id INTO _channel_id FROM public.chat_channels
    WHERE company_id = NEW.company_id AND slug = 'sales-wins' LIMIT 1;
  IF _channel_id IS NULL THEN
    INSERT INTO public.chat_channels (company_id, name, slug, kind, is_system, created_by, topic)
    VALUES (NEW.company_id, 'Sales Wins', 'sales-wins', 'channel', true, NEW.assigned_to, 'Celebrate every deal won')
    RETURNING id INTO _channel_id;
  END IF;

  SELECT COALESCE(full_name, email, 'A teammate') INTO _rep_name
    FROM public.profiles WHERE id = COALESCE(NEW.assigned_to, NEW.created_by);

  _amount := COALESCE(to_char(NEW.expected_value, 'FM999,999,999,999'), '—');
  _body := COALESCE(_rep_name,'A teammate') || ' just closed ' || NEW.customer_name
           || COALESCE(' — ' || NULLIF(NEW.company_name,''), '')
           || ' — ' || NEW.currency || _amount || '! 🎉';

  INSERT INTO public.chat_messages (channel_id, company_id, sender_id, body, is_system, metadata)
  VALUES (_channel_id, NEW.company_id, COALESCE(NEW.assigned_to, NEW.created_by), _body, true,
          jsonb_build_object('lead_id', NEW.id, 'amount', NEW.expected_value, 'currency', NEW.currency));

  RETURN NEW;
END $$;

CREATE TRIGGER crm_leads_sales_win_post
  AFTER INSERT OR UPDATE OF stage ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.chat_post_sales_win();

-- =========================================================
-- Realtime publication
-- =========================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_channel_members;

ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.chat_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.chat_channel_members REPLICA IDENTITY FULL;
