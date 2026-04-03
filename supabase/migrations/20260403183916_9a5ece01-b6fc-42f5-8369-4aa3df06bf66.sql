-- Add status and submitted_by_org to applications
ALTER TABLE public.applications 
  ADD COLUMN status text NOT NULL DEFAULT 'approved',
  ADD COLUMN submitted_by_org uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

-- Add status to org_integrations for skip/hide tracking
ALTER TABLE public.org_integrations 
  ADD COLUMN status text NOT NULL DEFAULT 'pending';

-- Update org_integrations: migrate existing is_configured=true to status='configured'
UPDATE public.org_integrations SET status = 'configured' WHERE is_configured = true;

-- Drop the old "Anyone can view applications" policy and replace with org-aware one
DROP POLICY IF EXISTS "Anyone can view applications" ON public.applications;

CREATE POLICY "View approved or own org apps"
  ON public.applications FOR SELECT
  USING (
    status = 'approved' 
    OR submitted_by_org = get_user_org_id()
  );

-- Allow authenticated users to insert apps (for catalog submissions)
CREATE POLICY "Authenticated users can add apps"
  ON public.applications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create index for performance
CREATE INDEX idx_applications_status ON public.applications(status);
CREATE INDEX idx_applications_submitted_by_org ON public.applications(submitted_by_org);