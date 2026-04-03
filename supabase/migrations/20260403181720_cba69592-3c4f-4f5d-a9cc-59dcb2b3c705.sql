
-- Enable extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create org_integrations table
CREATE TABLE public.org_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  is_configured BOOLEAN NOT NULL DEFAULT false,
  configured_at TIMESTAMP WITH TIME ZONE,
  configured_by UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, integration_id)
);

-- Enable RLS
ALTER TABLE public.org_integrations ENABLE ROW LEVEL SECURITY;

-- Members can view their org's integration status
CREATE POLICY "Members can view org integrations"
ON public.org_integrations FOR SELECT
USING (is_org_member(organization_id));

-- Admins can insert
CREATE POLICY "Admins can insert org integrations"
ON public.org_integrations FOR INSERT
TO authenticated
WITH CHECK (is_org_admin(organization_id));

-- Admins can update
CREATE POLICY "Admins can update org integrations"
ON public.org_integrations FOR UPDATE
USING (is_org_admin(organization_id));

-- Admins can delete
CREATE POLICY "Admins can delete org integrations"
ON public.org_integrations FOR DELETE
USING (is_org_admin(organization_id));

-- Trigger for updated_at
CREATE TRIGGER update_org_integrations_updated_at
BEFORE UPDATE ON public.org_integrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
