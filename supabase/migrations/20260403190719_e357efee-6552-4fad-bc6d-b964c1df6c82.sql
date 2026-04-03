-- Platform admins can delete organizations
CREATE POLICY "Platform admins can delete orgs"
ON public.organizations
FOR DELETE
TO authenticated
USING (is_platform_admin());

-- Platform admins can update any org
CREATE POLICY "Platform admins can update any org"
ON public.organizations
FOR UPDATE
TO authenticated
USING (is_platform_admin());

-- Platform admins can update any user role
CREATE POLICY "Platform admins can update any role"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (is_platform_admin());

-- Platform admins can delete any user role
CREATE POLICY "Platform admins can delete any role"
ON public.user_roles
FOR DELETE
TO authenticated
USING (is_platform_admin());