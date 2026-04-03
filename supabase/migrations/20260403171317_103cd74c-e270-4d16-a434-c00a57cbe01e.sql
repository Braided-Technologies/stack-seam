
DROP POLICY "Authenticated users can create orgs" ON public.organizations;
CREATE POLICY "Authenticated users can create orgs" ON public.organizations FOR INSERT TO authenticated WITH CHECK (
  NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
);
