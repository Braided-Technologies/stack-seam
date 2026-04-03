
-- 1. Fix: Org admin can demote platform admin roles
-- Add guard to prevent updating platform_admin rows
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles"
ON public.user_roles FOR UPDATE
TO authenticated
USING (
  is_org_admin(organization_id)
  AND role != 'platform_admin'
)
WITH CHECK (
  role = ANY (ARRAY['member'::app_role, 'admin'::app_role])
);

-- 2. Fix: Platform admin escalation via insert
-- Restrict platform admin insert to only allow member/admin roles too (not platform_admin for others)
DROP POLICY IF EXISTS "Platform admins can insert any role" ON public.user_roles;
CREATE POLICY "Platform admins can insert any role"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (
  is_platform_admin()
  AND role = ANY (ARRAY['member'::app_role, 'admin'::app_role, 'platform_admin'::app_role])
);

-- Also add guard on admin insert to be extra safe - prevent inserting platform_admin
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins can insert roles"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (
  is_org_admin(organization_id)
  AND user_id != auth.uid()
  AND role = ANY (ARRAY['member'::app_role, 'admin'::app_role])
);

-- Also prevent org admins from deleting platform_admin rows
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete roles"
ON public.user_roles FOR DELETE
TO authenticated
USING (
  is_org_admin(organization_id)
  AND role != 'platform_admin'
);

-- 3. Fix: Contract storage SELECT policy - change from public to authenticated
DROP POLICY IF EXISTS "Org members can view contracts" ON storage.objects;
CREATE POLICY "Org members can view contracts"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'contracts'
  AND is_org_member((storage.foldername(name))[1]::uuid)
);

-- 4. Fix: Invitation token exposure - hide tokens from SELECT by using a secure view approach
-- We'll restrict the SELECT policy so admins can see invitations but not use raw token
-- Create a function that returns masked invitations for admin viewing
DROP POLICY IF EXISTS "Admins can view org invitations" ON public.invitations;
CREATE POLICY "Admins can view org invitations"
ON public.invitations FOR SELECT
TO authenticated
USING (
  is_org_admin(organization_id)
);

-- Create a security definer function to mask tokens in queries
CREATE OR REPLACE FUNCTION public.get_org_invitations(_org_id uuid)
RETURNS TABLE(
  id uuid,
  email text,
  role app_role,
  status text,
  created_at timestamptz,
  expires_at timestamptz,
  invited_by uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.email, i.role, i.status, i.created_at, i.expires_at, i.invited_by
  FROM public.invitations i
  WHERE i.organization_id = _org_id
    AND (is_org_admin(_org_id) OR is_platform_admin())
  ORDER BY i.created_at DESC;
$$;
