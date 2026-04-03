
-- Create is_platform_admin function
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'platform_admin'
  );
$$;

-- Create feedback table
CREATE TABLE public.feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'bug',
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  admin_response text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can submit feedback"
  ON public.feedback FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own feedback"
  ON public.feedback FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_platform_admin());

CREATE POLICY "Platform admins can update feedback"
  ON public.feedback FOR UPDATE
  TO authenticated
  USING (is_platform_admin());

CREATE POLICY "Platform admins can delete feedback"
  ON public.feedback FOR DELETE
  TO authenticated
  USING (is_platform_admin());

CREATE TRIGGER update_feedback_updated_at
  BEFORE UPDATE ON public.feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Platform admin policies on applications
CREATE POLICY "Platform admins can update applications"
  ON public.applications FOR UPDATE
  TO authenticated
  USING (is_platform_admin());

CREATE POLICY "Platform admins can delete applications"
  ON public.applications FOR DELETE
  TO authenticated
  USING (is_platform_admin());

-- Platform admins can view all organizations
CREATE POLICY "Platform admins can view all orgs"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (is_platform_admin());

-- Platform admins can view all user roles
CREATE POLICY "Platform admins can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (is_platform_admin());

-- Indexes
CREATE INDEX idx_feedback_user_id ON public.feedback(user_id);
CREATE INDEX idx_feedback_status ON public.feedback(status);
CREATE INDEX idx_feedback_type ON public.feedback(type);
