-- Replace overly permissive INSERT policy with org-scoped one
DROP POLICY IF EXISTS "Authenticated users can add apps" ON public.applications;

CREATE POLICY "Users can submit apps for their org"
  ON public.applications FOR INSERT
  TO authenticated
  WITH CHECK (
    submitted_by_org = get_user_org_id()
    AND status = 'org_only'
  );