
-- Create a security definer function to check if user has any role
CREATE OR REPLACE FUNCTION public.user_has_any_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
  );
$$;

-- Drop and recreate the org insert policy using the new function
DROP POLICY IF EXISTS "Authenticated users can create orgs" ON public.organizations;

CREATE POLICY "Authenticated users can create orgs"
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (NOT public.user_has_any_role());
