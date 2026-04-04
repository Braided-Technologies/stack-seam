
-- Allow org members (not just admins) to add apps to their stack
DROP POLICY IF EXISTS "Admins can insert org apps" ON public.user_applications;
CREATE POLICY "Members can insert org apps"
ON public.user_applications FOR INSERT
TO authenticated
WITH CHECK (is_org_member(organization_id));
