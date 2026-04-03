DROP POLICY IF EXISTS "Admins can delete contract files" ON public.contract_files;

CREATE POLICY "Admins can delete contract files" ON public.contract_files
FOR DELETE TO authenticated
USING (
  is_org_admin(( SELECT user_applications.organization_id FROM user_applications WHERE user_applications.id = contract_files.user_application_id))
  OR is_platform_admin()
);