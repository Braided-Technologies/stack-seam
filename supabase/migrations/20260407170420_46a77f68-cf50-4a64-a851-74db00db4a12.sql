-- Applications: restrict SELECT to authenticated
DROP POLICY IF EXISTS "View approved or own org apps" ON public.applications;
CREATE POLICY "View approved or own org apps" ON public.applications
  FOR SELECT TO authenticated
  USING ((status = 'approved') OR (submitted_by_org = get_user_org_id()));

-- Integrations: restrict SELECT to authenticated
DROP POLICY IF EXISTS "Anyone can view approved or own integrations" ON public.integrations;
CREATE POLICY "Authenticated can view approved or own integrations" ON public.integrations
  FOR SELECT TO authenticated
  USING ((status = 'approved') OR (submitted_by_org = get_user_org_id()) OR is_platform_admin());

-- Categories: restrict SELECT to authenticated
DROP POLICY IF EXISTS "Anyone can view categories" ON public.categories;
CREATE POLICY "Authenticated can view categories" ON public.categories
  FOR SELECT TO authenticated
  USING (true);