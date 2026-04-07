-- Drop the existing policy
DROP POLICY IF EXISTS "Users can submit feedback" ON public.feedback;

-- Recreate with org ownership validation
CREATE POLICY "Users can submit feedback" ON public.feedback
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      organization_id IS NULL
      OR organization_id = get_user_org_id()
    )
  );