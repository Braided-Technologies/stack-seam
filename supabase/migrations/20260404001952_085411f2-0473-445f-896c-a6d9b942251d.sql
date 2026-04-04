
-- KB Categories
CREATE TABLE public.kb_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kb_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view kb categories" ON public.kb_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Platform admins can insert kb categories" ON public.kb_categories FOR INSERT TO authenticated WITH CHECK (is_platform_admin());
CREATE POLICY "Platform admins can update kb categories" ON public.kb_categories FOR UPDATE TO authenticated USING (is_platform_admin());
CREATE POLICY "Platform admins can delete kb categories" ON public.kb_categories FOR DELETE TO authenticated USING (is_platform_admin());

-- KB Articles
CREATE TABLE public.kb_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.kb_categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  content text NOT NULL DEFAULT '',
  tags text[] DEFAULT '{}',
  is_published boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kb_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view published articles" ON public.kb_articles FOR SELECT TO authenticated USING (is_published OR is_platform_admin());
CREATE POLICY "Platform admins can insert articles" ON public.kb_articles FOR INSERT TO authenticated WITH CHECK (is_platform_admin());
CREATE POLICY "Platform admins can update articles" ON public.kb_articles FOR UPDATE TO authenticated USING (is_platform_admin());
CREATE POLICY "Platform admins can delete articles" ON public.kb_articles FOR DELETE TO authenticated USING (is_platform_admin());

-- Triggers for updated_at
CREATE TRIGGER update_kb_categories_updated_at BEFORE UPDATE ON public.kb_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_kb_articles_updated_at BEFORE UPDATE ON public.kb_articles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
