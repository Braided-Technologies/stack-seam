
-- Fix contacts RLS: allow platform admins
CREATE POLICY "Platform admins can insert contacts"
ON public.contacts FOR INSERT TO authenticated
WITH CHECK (is_platform_admin());

CREATE POLICY "Platform admins can update contacts"
ON public.contacts FOR UPDATE TO authenticated
USING (is_platform_admin());

CREATE POLICY "Platform admins can delete contacts"
ON public.contacts FOR DELETE TO authenticated
USING (is_platform_admin());

-- Add submission tracking columns to integrations
ALTER TABLE public.integrations
ADD COLUMN submitted_by_org uuid REFERENCES public.organizations(id),
ADD COLUMN submitted_by_user uuid,
ADD COLUMN status text NOT NULL DEFAULT 'approved';

-- Allow org admins to submit integrations with pending status
CREATE POLICY "Org admins can submit integrations"
ON public.integrations FOR INSERT TO authenticated
WITH CHECK (
  submitted_by_org = get_user_org_id()
  AND status = 'pending'
  AND submitted_by_user = auth.uid()
);

-- Update SELECT to show pending integrations to submitting org
DROP POLICY "Anyone can view integrations" ON public.integrations;
CREATE POLICY "Anyone can view approved or own integrations"
ON public.integrations FOR SELECT TO public
USING (status = 'approved' OR submitted_by_org = get_user_org_id() OR is_platform_admin());
