-- Fix 1: Prevent org admins from updating their own role (privilege escalation)
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (is_org_admin(organization_id) AND role <> 'platform_admin'::app_role AND user_id <> auth.uid())
WITH CHECK (role = ANY (ARRAY['member'::app_role, 'admin'::app_role]));

-- Fix 2: Add missing SELECT policy for platform admins on contacts
CREATE POLICY "Platform admins can view contacts"
ON public.contacts
FOR SELECT
TO authenticated
USING (is_platform_admin());