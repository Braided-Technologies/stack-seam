
-- Add domain column to organizations
ALTER TABLE public.organizations ADD COLUMN domain text;
CREATE UNIQUE INDEX idx_organizations_domain ON public.organizations (domain) WHERE domain IS NOT NULL;

-- Platform admins can access org_settings
CREATE POLICY "Platform admins can view all org settings"
ON public.org_settings FOR SELECT TO authenticated
USING (is_platform_admin());

CREATE POLICY "Platform admins can insert org settings"
ON public.org_settings FOR INSERT TO authenticated
WITH CHECK (is_platform_admin());

CREATE POLICY "Platform admins can update org settings"
ON public.org_settings FOR UPDATE TO authenticated
USING (is_platform_admin());

CREATE POLICY "Platform admins can delete org settings"
ON public.org_settings FOR DELETE TO authenticated
USING (is_platform_admin());
