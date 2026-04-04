-- Allow platform admins to create invitations
CREATE POLICY "Platform admins can create invitations"
ON public.invitations
FOR INSERT
TO authenticated
WITH CHECK (is_platform_admin() AND (invited_by = auth.uid()));

-- Allow platform admins to view all invitations
CREATE POLICY "Platform admins can view all invitations"
ON public.invitations
FOR SELECT
TO authenticated
USING (is_platform_admin());

-- Allow platform admins to update any invitation
CREATE POLICY "Platform admins can update any invitation"
ON public.invitations
FOR UPDATE
TO authenticated
USING (is_platform_admin());

-- Allow platform admins to delete any invitation
CREATE POLICY "Platform admins can delete any invitation"
ON public.invitations
FOR DELETE
TO authenticated
USING (is_platform_admin());