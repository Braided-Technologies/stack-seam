
-- Platform admins can insert org_integrations
CREATE POLICY "Platform admins can insert org integrations"
ON public.org_integrations
FOR INSERT
TO authenticated
WITH CHECK (is_platform_admin());

-- Platform admins can update org_integrations
CREATE POLICY "Platform admins can update org integrations"
ON public.org_integrations
FOR UPDATE
TO authenticated
USING (is_platform_admin());

-- Platform admins can delete org_integrations
CREATE POLICY "Platform admins can delete org integrations"
ON public.org_integrations
FOR DELETE
TO authenticated
USING (is_platform_admin());

-- Platform admins can view all org_integrations
CREATE POLICY "Platform admins can view all org integrations"
ON public.org_integrations
FOR SELECT
TO authenticated
USING (is_platform_admin());
