-- Drop old INSERT policy
DROP POLICY IF EXISTS "Admins can insert contract files" ON public.contract_files;

-- Recreate with platform_admin support
CREATE POLICY "Admins can insert contract files" ON public.contract_files
FOR INSERT TO authenticated
WITH CHECK (
  (
    is_org_admin(( SELECT user_applications.organization_id FROM user_applications WHERE user_applications.id = contract_files.user_application_id))
    OR is_platform_admin()
  )
  AND (uploaded_by = auth.uid())
);