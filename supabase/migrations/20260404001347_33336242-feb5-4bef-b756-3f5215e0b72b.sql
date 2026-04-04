
DROP POLICY IF EXISTS "Admins can update org apps" ON public.user_applications;
CREATE POLICY "Admins can update org apps"
ON public.user_applications FOR UPDATE
TO authenticated
USING (is_org_admin(organization_id) OR is_platform_admin());
