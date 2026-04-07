
-- Tighten user_roles UPDATE policy for platform admins to prevent setting invalid roles
DROP POLICY IF EXISTS "Platform admins can update any role" ON public.user_roles;
CREATE POLICY "Platform admins can update any role" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (role = ANY(ARRAY['member'::app_role, 'admin'::app_role, 'platform_admin'::app_role]));

-- Add DELETE policy for feedback-screenshots bucket
CREATE POLICY "Users can delete own feedback screenshots"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'feedback-screenshots' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- Add platform admin SELECT policy for contracts bucket
CREATE POLICY "Platform admins can view all contract files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'contracts' AND is_platform_admin());
