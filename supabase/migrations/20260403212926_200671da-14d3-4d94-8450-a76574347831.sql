
-- 1. Remove the dangerous self-admin-insert policy
DROP POLICY IF EXISTS "Users can insert own initial role" ON public.user_roles;

-- 2. Fix admin insert policy to prevent platform_admin escalation
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    is_org_admin(organization_id)
    AND user_id <> auth.uid()
    AND role IN ('member'::app_role, 'admin'::app_role)
  );

-- 3. Fix admin update policy to prevent platform_admin escalation
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles"
  ON public.user_roles FOR UPDATE
  TO authenticated
  USING (is_org_admin(organization_id))
  WITH CHECK (role IN ('member'::app_role, 'admin'::app_role));

-- 4. Fix storage upload policy: use is_org_admin instead of is_org_member
DROP POLICY IF EXISTS "Org admins can upload contracts" ON storage.objects;
CREATE POLICY "Org admins can upload contracts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'contracts'
    AND is_org_admin(((storage.foldername(name))[1])::uuid)
  );

-- 5. Add explicit UPDATE policy for contracts storage
CREATE POLICY "Org admins can update contracts"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'contracts'
    AND is_org_admin(((storage.foldername(name))[1])::uuid)
  );
