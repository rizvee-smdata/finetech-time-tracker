
-- OEM partners / categories
CREATE TABLE public.kb_oems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  logo_url text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.kb_oems TO authenticated;
GRANT ALL ON public.kb_oems TO service_role;
ALTER TABLE public.kb_oems ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kb_oems readable to authenticated" ON public.kb_oems FOR SELECT TO authenticated USING (true);
CREATE POLICY "kb_oems staff manage" ON public.kb_oems FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER trg_kb_oems_updated BEFORE UPDATE ON public.kb_oems
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Articles
CREATE TABLE public.kb_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  oem_id uuid REFERENCES public.kb_oems(id) ON DELETE SET NULL,
  title text NOT NULL,
  slug text,
  article_type text NOT NULL DEFAULT 'product_spec'
    CHECK (article_type IN ('product_spec','pricing','battlecard','faq','case_study','brochure','other')),
  summary text,
  content_html text NOT NULL DEFAULT '',
  content_text text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  version int NOT NULL DEFAULT 1,
  published boolean NOT NULL DEFAULT false,
  view_count int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  search_tsv tsvector,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kb_articles TO authenticated;
GRANT ALL ON public.kb_articles TO service_role;
ALTER TABLE public.kb_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kb_articles read published" ON public.kb_articles FOR SELECT TO authenticated
  USING (published = true OR public.is_staff(auth.uid()));
CREATE POLICY "kb_articles staff manage" ON public.kb_articles FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER trg_kb_articles_updated BEFORE UPDATE ON public.kb_articles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Versions
CREATE TABLE public.kb_article_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.kb_articles(id) ON DELETE CASCADE,
  version int NOT NULL,
  title text NOT NULL,
  content_html text NOT NULL,
  summary text,
  edited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.kb_article_versions TO authenticated;
GRANT ALL ON public.kb_article_versions TO service_role;
ALTER TABLE public.kb_article_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kb_versions read" ON public.kb_article_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "kb_versions staff insert" ON public.kb_article_versions FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

-- Bookmarks
CREATE TABLE public.kb_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES public.kb_articles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, article_id)
);
GRANT SELECT, INSERT, DELETE ON public.kb_bookmarks TO authenticated;
GRANT ALL ON public.kb_bookmarks TO service_role;
ALTER TABLE public.kb_bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kb_bookmarks own" ON public.kb_bookmarks FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- AI Q&A history
CREATE TABLE public.kb_ask_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  question text NOT NULL,
  answer text NOT NULL,
  source_article_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.kb_ask_log TO authenticated;
GRANT ALL ON public.kb_ask_log TO service_role;
ALTER TABLE public.kb_ask_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kb_ask_log own" ON public.kb_ask_log FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_staff(auth.uid()));
CREATE POLICY "kb_ask_log insert own" ON public.kb_ask_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- pg_trgm + full-text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.kb_articles_tsv_update() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('simple', coalesce(NEW.title,'')), 'A') ||
    setweight(to_tsvector('simple', array_to_string(NEW.tags, ' ')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.summary,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.content_text,'')), 'C');
  RETURN NEW;
END $$;
CREATE TRIGGER trg_kb_articles_tsv BEFORE INSERT OR UPDATE
  ON public.kb_articles FOR EACH ROW EXECUTE FUNCTION public.kb_articles_tsv_update();

CREATE INDEX kb_articles_tsv_idx ON public.kb_articles USING gin(search_tsv);
CREATE INDEX kb_articles_title_trgm ON public.kb_articles USING gin(title gin_trgm_ops);
CREATE INDEX kb_articles_tags_idx ON public.kb_articles USING gin(tags);
CREATE INDEX kb_articles_oem_idx ON public.kb_articles(oem_id);

-- Search RPC
CREATE OR REPLACE FUNCTION public.kb_search(_q text, _limit int DEFAULT 10)
RETURNS TABLE (
  id uuid, title text, summary text, article_type text,
  oem_id uuid, oem_name text, oem_slug text,
  updated_at timestamptz, rank real
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.title, a.summary, a.article_type,
         a.oem_id, o.name, o.slug, a.updated_at,
         (ts_rank(a.search_tsv, websearch_to_tsquery('simple', _q))
          + similarity(a.title, _q) * 0.5)::real AS rank
  FROM public.kb_articles a
  LEFT JOIN public.kb_oems o ON o.id = a.oem_id
  WHERE a.published = true
    AND (
      a.search_tsv @@ websearch_to_tsquery('simple', _q)
      OR a.title ILIKE '%' || _q || '%'
      OR _q = ANY(a.tags)
    )
  ORDER BY rank DESC NULLS LAST, a.updated_at DESC
  LIMIT _limit;
$$;
GRANT EXECUTE ON FUNCTION public.kb_search(text, int) TO authenticated;

-- Seed OEM partners (global - no company_id)
INSERT INTO public.kb_oems (slug, name, description, sort_order) VALUES
  ('fortinet','Fortinet','Network security, firewalls, SD-WAN, SASE', 1),
  ('rubrik','Rubrik','Data security, backup, ransomware recovery', 2),
  ('hivepro','HivePro','Threat exposure management', 3),
  ('gambit-cyber','Gambit Cyber','Offensive security & assessments', 4),
  ('gurucul','Gurucul','Next-gen SIEM, UEBA, XDR', 5),
  ('linkshadow','LinkShadow','Network detection & response (NDR)', 6),
  ('adaptiva','Adaptiva','Endpoint management & patching at scale', 7),
  ('deepx','DEEPX','AI semiconductor / on-device AI', 8),
  ('gopher-security','Gopher Security','Zero-trust & secure connectivity', 9)
ON CONFLICT (slug) DO NOTHING;
