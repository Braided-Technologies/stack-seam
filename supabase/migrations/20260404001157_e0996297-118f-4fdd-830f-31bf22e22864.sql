
-- Revert: only admins can insert org apps
DROP POLICY IF EXISTS "Members can insert org apps" ON public.user_applications;
CREATE POLICY "Admins can insert org apps"
ON public.user_applications FOR INSERT
TO authenticated
WITH CHECK (is_org_admin(organization_id) OR is_platform_admin());
