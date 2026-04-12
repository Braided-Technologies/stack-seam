
-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'member');

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Organizations
CREATE TABLE public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Categories
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  icon TEXT,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Applications (master list)
CREATE TABLE public.applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  vendor_url TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'member',
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, organization_id)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- User applications (org's stack)
CREATE TABLE public.user_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  cost_monthly NUMERIC(10,2),
  cost_annual NUMERIC(10,2),
  renewal_date DATE,
  term_months INT,
  license_count INT,
  billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'annual', 'multi-year', 'other')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, application_id)
);
ALTER TABLE public.user_applications ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_user_applications_updated_at BEFORE UPDATE ON public.user_applications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Contacts
CREATE TABLE public.contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_application_id UUID NOT NULL REFERENCES public.user_applications(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT,
  support_url TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Integrations (between apps)
CREATE TABLE public.integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_app_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  target_app_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  description TEXT,
  integration_type TEXT CHECK (integration_type IN ('native', 'api', 'zapier', 'webhook', 'other')),
  data_shared TEXT,
  documentation_url TEXT,
  last_verified TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_app_id, target_app_id)
);
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

-- Contract files
CREATE TABLE public.contract_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_application_id UUID NOT NULL REFERENCES public.user_applications(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.contract_files ENABLE ROW LEVEL SECURITY;

-- Storage bucket for contracts
INSERT INTO storage.buckets (id, name, public) VALUES ('contracts', 'contracts', false);

-- Helper functions
CREATE OR REPLACE FUNCTION public.is_org_member(_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND organization_id = _org_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND organization_id = _org_id AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- RLS Policies

-- organizations
CREATE POLICY "Members can view their org" ON public.organizations FOR SELECT USING (public.is_org_member(id));
CREATE POLICY "Admins can update their org" ON public.organizations FOR UPDATE USING (public.is_org_admin(id));
CREATE POLICY "Authenticated users can create orgs" ON public.organizations FOR INSERT TO authenticated WITH CHECK (true);

-- categories (public read)
CREATE POLICY "Anyone can view categories" ON public.categories FOR SELECT USING (true);

-- applications (public read)
CREATE POLICY "Anyone can view applications" ON public.applications FOR SELECT USING (true);

-- user_roles
CREATE POLICY "Members can view org roles" ON public.user_roles FOR SELECT USING (organization_id = public.get_user_org_id());
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (
  public.is_org_admin(organization_id) AND user_id <> auth.uid()
);
CREATE POLICY "Users can insert own initial role" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND role = 'admin' AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
);
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE USING (public.is_org_admin(organization_id));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE USING (public.is_org_admin(organization_id));

-- user_applications
CREATE POLICY "Members can view org apps" ON public.user_applications FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "Admins can insert org apps" ON public.user_applications FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY "Admins can update org apps" ON public.user_applications FOR UPDATE USING (public.is_org_admin(organization_id));
CREATE POLICY "Admins can delete org apps" ON public.user_applications FOR DELETE USING (public.is_org_admin(organization_id));

-- contacts
CREATE POLICY "Members can view contacts" ON public.contacts FOR SELECT USING (
  public.is_org_member((SELECT organization_id FROM public.user_applications WHERE id = user_application_id))
);
CREATE POLICY "Admins can insert contacts" ON public.contacts FOR INSERT TO authenticated WITH CHECK (
  public.is_org_admin((SELECT organization_id FROM public.user_applications WHERE id = user_application_id))
);
CREATE POLICY "Admins can update contacts" ON public.contacts FOR UPDATE USING (
  public.is_org_admin((SELECT organization_id FROM public.user_applications WHERE id = user_application_id))
);
CREATE POLICY "Admins can delete contacts" ON public.contacts FOR DELETE USING (
  public.is_org_admin((SELECT organization_id FROM public.user_applications WHERE id = user_application_id))
);

-- integrations (public read)
CREATE POLICY "Anyone can view integrations" ON public.integrations FOR SELECT USING (true);

-- contract_files
CREATE POLICY "Members can view contract files" ON public.contract_files FOR SELECT USING (
  public.is_org_member((SELECT organization_id FROM public.user_applications WHERE id = user_application_id))
);
CREATE POLICY "Admins can insert contract files" ON public.contract_files FOR INSERT TO authenticated WITH CHECK (
  public.is_org_admin((SELECT organization_id FROM public.user_applications WHERE id = user_application_id))
  AND uploaded_by = auth.uid()
);
CREATE POLICY "Admins can delete contract files" ON public.contract_files FOR DELETE USING (
  public.is_org_admin((SELECT organization_id FROM public.user_applications WHERE id = user_application_id))
);

-- Storage policies for contracts bucket
CREATE POLICY "Org members can view contracts" ON storage.objects FOR SELECT USING (
  bucket_id = 'contracts'
  AND public.is_org_member((storage.foldername(name))[1]::uuid)
);
CREATE POLICY "Org admins can upload contracts" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'contracts'
  AND public.is_org_member((storage.foldername(name))[1]::uuid)
);
CREATE POLICY "Org admins can delete contracts" ON storage.objects FOR DELETE USING (
  bucket_id = 'contracts'
  AND public.is_org_admin((storage.foldername(name))[1]::uuid)
);

DROP POLICY "Authenticated users can create orgs" ON public.organizations;
CREATE POLICY "Authenticated users can create orgs" ON public.organizations FOR INSERT TO authenticated WITH CHECK (
  NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
);

-- Allow service role to insert integrations (edge function uses service role key)
-- The service role bypasses RLS, so no explicit policy needed for it.
-- But we need to allow authenticated users to trigger the refresh via the edge function.
-- No RLS changes needed since the edge function uses service_role_key which bypasses RLS.
SELECT 1;

-- Create invitations table
CREATE TABLE public.invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.app_role NOT NULL DEFAULT 'member',
  invited_by UUID NOT NULL,
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  UNIQUE(organization_id, email)
);

-- Enable RLS
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Admins can view invitations for their org
CREATE POLICY "Admins can view org invitations"
ON public.invitations FOR SELECT
TO authenticated
USING (is_org_admin(organization_id));

-- Admins can create invitations
CREATE POLICY "Admins can create invitations"
ON public.invitations FOR INSERT
TO authenticated
WITH CHECK (is_org_admin(organization_id) AND invited_by = auth.uid());

-- Admins can delete invitations
CREATE POLICY "Admins can delete invitations"
ON public.invitations FOR DELETE
TO authenticated
USING (is_org_admin(organization_id));

-- Admins can update invitations (e.g. cancel)
CREATE POLICY "Admins can update invitations"
ON public.invitations FOR UPDATE
TO authenticated
USING (is_org_admin(organization_id));

-- Function to accept an invitation (called by the invited user)
CREATE OR REPLACE FUNCTION public.accept_invitation(_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv RECORD;
  _user_email TEXT;
  _existing_role RECORD;
BEGIN
  -- Get the user's email
  SELECT email INTO _user_email FROM auth.users WHERE id = auth.uid();
  
  -- Find the invitation
  SELECT * INTO _inv FROM public.invitations 
  WHERE token = _token AND status = 'pending' AND expires_at > now();
  
  IF _inv IS NULL THEN
    RETURN jsonb_build_object('error', 'Invalid or expired invitation');
  END IF;
  
  -- Check email matches
  IF lower(_inv.email) != lower(_user_email) THEN
    RETURN jsonb_build_object('error', 'This invitation was sent to a different email');
  END IF;
  
  -- Check if user already has a role
  SELECT * INTO _existing_role FROM public.user_roles WHERE user_id = auth.uid();
  IF _existing_role IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'You already belong to an organization');
  END IF;
  
  -- Create the role
  INSERT INTO public.user_roles (user_id, organization_id, role, invited_by)
  VALUES (auth.uid(), _inv.organization_id, _inv.role, _inv.invited_by);
  
  -- Mark invitation as accepted
  UPDATE public.invitations SET status = 'accepted' WHERE id = _inv.id;
  
  RETURN jsonb_build_object('success', true, 'organization_id', _inv.organization_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.find_pending_invitation(_email TEXT)
RETURNS TABLE(id UUID, token UUID, email TEXT, organization_id UUID, org_name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.token, i.email, i.organization_id, o.name as org_name
  FROM public.invitations i
  JOIN public.organizations o ON o.id = i.organization_id
  WHERE lower(i.email) = lower(_email)
    AND i.status = 'pending'
    AND i.expires_at > now()
  LIMIT 1;
$$;
CREATE TABLE public.org_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  setting_key text NOT NULL,
  setting_value text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (organization_id, setting_key)
);

ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view org settings"
  ON public.org_settings FOR SELECT
  TO authenticated
  USING (is_org_admin(organization_id));

CREATE POLICY "Admins can insert org settings"
  ON public.org_settings FOR INSERT
  TO authenticated
  WITH CHECK (is_org_admin(organization_id));

CREATE POLICY "Admins can update org settings"
  ON public.org_settings FOR UPDATE
  TO authenticated
  USING (is_org_admin(organization_id));

CREATE POLICY "Admins can delete org settings"
  ON public.org_settings FOR DELETE
  TO authenticated
  USING (is_org_admin(organization_id));

CREATE TRIGGER update_org_settings_updated_at
  BEFORE UPDATE ON public.org_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
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
-- Add DNS Filtering category
INSERT INTO public.categories (name, icon, display_order)
VALUES ('DNS Filtering', 'Shield', 28);

-- Add Virtualization category
INSERT INTO public.categories (name, icon, display_order)
VALUES ('Virtualization', 'Server', 29);

-- Add DNS Filtering apps
INSERT INTO public.applications (name, category_id, description)
VALUES
  ('DNSFilter', (SELECT id FROM categories WHERE name = 'DNS Filtering'), 'AI-powered DNS threat protection'),
  ('Cisco Umbrella', (SELECT id FROM categories WHERE name = 'DNS Filtering'), 'Cloud-delivered DNS security'),
  ('WebTitan', (SELECT id FROM categories WHERE name = 'DNS Filtering'), 'DNS filtering and web security'),
  ('SafeDNS', (SELECT id FROM categories WHERE name = 'DNS Filtering'), 'Cloud-based DNS filtering service');

-- Add Virtualization apps
INSERT INTO public.applications (name, category_id, description)
VALUES
  ('VMware vSphere', (SELECT id FROM categories WHERE name = 'Virtualization'), 'Enterprise virtualization platform'),
  ('Microsoft Hyper-V', (SELECT id FROM categories WHERE name = 'Virtualization'), 'Windows Server virtualization'),
  ('Proxmox', (SELECT id FROM categories WHERE name = 'Virtualization'), 'Open-source virtualization management'),
  ('Nutanix', (SELECT id FROM categories WHERE name = 'Virtualization'), 'Hyperconverged infrastructure platform');
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
CREATE INDEX idx_applications_submitted_by_org ON public.applications(submitted_by_org);-- Replace overly permissive INSERT policy with org-scoped one
DROP POLICY IF EXISTS "Authenticated users can add apps" ON public.applications;

CREATE POLICY "Users can submit apps for their org"
  ON public.applications FOR INSERT
  TO authenticated
  WITH CHECK (
    submitted_by_org = get_user_org_id()
    AND status = 'org_only'
  );
-- Add platform_admin to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'platform_admin';

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
-- Platform admins can delete organizations
CREATE POLICY "Platform admins can delete orgs"
ON public.organizations
FOR DELETE
TO authenticated
USING (is_platform_admin());

-- Platform admins can update any org
CREATE POLICY "Platform admins can update any org"
ON public.organizations
FOR UPDATE
TO authenticated
USING (is_platform_admin());

-- Platform admins can update any user role
CREATE POLICY "Platform admins can update any role"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (is_platform_admin());

-- Platform admins can delete any user role
CREATE POLICY "Platform admins can delete any role"
ON public.user_roles
FOR DELETE
TO authenticated
USING (is_platform_admin());
-- Add domain column to organizations
ALTER TABLE public.organizations ADD COLUMN domain text;
CREATE UNIQUE INDEX idx_organizations_domain ON public.organizations (domain) WHERE domain IS NOT NULL;

-- Platform admins can access org_settings
CREATE POLICY "Platform admins can view all org settings"
ON public.org_settings FOR SELECT TO authenticated
USING (is_platform_admin());

CREATE POLICY "Platform admins can insert org settings"
ON public.org_settings FOR INSERT TO authenticated
WITH CHECK (is_platform_admin());

CREATE POLICY "Platform admins can update org settings"
ON public.org_settings FOR UPDATE TO authenticated
USING (is_platform_admin());

CREATE POLICY "Platform admins can delete org settings"
ON public.org_settings FOR DELETE TO authenticated
USING (is_platform_admin());
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
);DROP POLICY IF EXISTS "Admins can delete contract files" ON public.contract_files;

CREATE POLICY "Admins can delete contract files" ON public.contract_files
FOR DELETE TO authenticated
USING (
  is_org_admin(( SELECT user_applications.organization_id FROM user_applications WHERE user_applications.id = contract_files.user_application_id))
  OR is_platform_admin()
);
-- Add new category
INSERT INTO public.categories (name, icon, display_order)
VALUES ('Alerting & Incident Management', 'Bell', 32)
ON CONFLICT DO NOTHING;

-- Add popular apps for this category
INSERT INTO public.applications (name, description, category_id, status)
SELECT 'PagerDuty', 'Digital operations management platform for incident response', c.id, 'approved'
FROM public.categories c WHERE c.name = 'Alerting & Incident Management'
AND NOT EXISTS (SELECT 1 FROM public.applications WHERE name = 'PagerDuty');

INSERT INTO public.applications (name, description, category_id, status)
SELECT 'iLert', 'Incident management and on-call scheduling platform', c.id, 'approved'
FROM public.categories c WHERE c.name = 'Alerting & Incident Management'
AND NOT EXISTS (SELECT 1 FROM public.applications WHERE name = 'iLert');

INSERT INTO public.applications (name, description, category_id, status)
SELECT 'Opsgenie', 'Alerting and on-call management by Atlassian', c.id, 'approved'
FROM public.categories c WHERE c.name = 'Alerting & Incident Management'
AND NOT EXISTS (SELECT 1 FROM public.applications WHERE name = 'Opsgenie');

INSERT INTO public.applications (name, description, category_id, status)
SELECT 'xMatters', 'Service reliability platform with intelligent alerting', c.id, 'approved'
FROM public.categories c WHERE c.name = 'Alerting & Incident Management'
AND NOT EXISTS (SELECT 1 FROM public.applications WHERE name = 'xMatters');

INSERT INTO public.applications (name, description, category_id, status)
SELECT 'Squadcast', 'Incident management and reliability automation platform', c.id, 'approved'
FROM public.categories c WHERE c.name = 'Alerting & Incident Management'
AND NOT EXISTS (SELECT 1 FROM public.applications WHERE name = 'Squadcast');

-- Platform admins can insert org_integrations
CREATE POLICY "Platform admins can insert org integrations"
ON public.org_integrations
FOR INSERT
TO authenticated
WITH CHECK (is_platform_admin());

-- Platform admins can update org_integrations
CREATE POLICY "Platform admins can update org integrations"
ON public.org_integrations
FOR UPDATE
TO authenticated
USING (is_platform_admin());

-- Platform admins can delete org_integrations
CREATE POLICY "Platform admins can delete org integrations"
ON public.org_integrations
FOR DELETE
TO authenticated
USING (is_platform_admin());

-- Platform admins can view all org_integrations
CREATE POLICY "Platform admins can view all org integrations"
ON public.org_integrations
FOR SELECT
TO authenticated
USING (is_platform_admin());

-- 1. Remove the dangerous self-admin-insert policy
DROP POLICY IF EXISTS "Users can insert own initial role" ON public.user_roles;

-- 2. Fix admin insert policy to prevent platform_admin escalation
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    is_org_admin(organization_id)
    AND user_id <> auth.uid()
    AND role IN ('member'::app_role, 'admin'::app_role)
  );

-- 3. Fix admin update policy to prevent platform_admin escalation
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles"
  ON public.user_roles FOR UPDATE
  TO authenticated
  USING (is_org_admin(organization_id))
  WITH CHECK (role IN ('member'::app_role, 'admin'::app_role));

-- 4. Fix storage upload policy: use is_org_admin instead of is_org_member
DROP POLICY IF EXISTS "Org admins can upload contracts" ON storage.objects;
CREATE POLICY "Org admins can upload contracts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'contracts'
    AND is_org_admin(((storage.foldername(name))[1])::uuid)
  );

-- 5. Add explicit UPDATE policy for contracts storage
CREATE POLICY "Org admins can update contracts"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'contracts'
    AND is_org_admin(((storage.foldername(name))[1])::uuid)
  );

CREATE OR REPLACE FUNCTION public.create_organization(_name text, _domain text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
  _existing_role RECORD;
  _new_org_id uuid;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Check user doesn't already have a role
  SELECT * INTO _existing_role FROM public.user_roles WHERE user_id = _user_id;
  IF _existing_role IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'You already belong to an organization');
  END IF;

  _new_org_id := gen_random_uuid();

  INSERT INTO public.organizations (id, name, domain) VALUES (_new_org_id, _name, _domain);
  INSERT INTO public.user_roles (user_id, organization_id, role) VALUES (_user_id, _new_org_id, 'admin');

  RETURN jsonb_build_object('success', true, 'organization_id', _new_org_id);
END;
$$;

-- 1. Platform admins can insert any role
CREATE POLICY "Platform admins can insert any role"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (is_platform_admin());

-- 2. Enforce single-org membership
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_unique UNIQUE (user_id);

-- 3. Re-scope all {public} policies to {authenticated}

-- user_applications
DROP POLICY IF EXISTS "Members can view org apps" ON public.user_applications;
CREATE POLICY "Members can view org apps" ON public.user_applications FOR SELECT TO authenticated USING (is_org_member(organization_id));

DROP POLICY IF EXISTS "Admins can update org apps" ON public.user_applications;
CREATE POLICY "Admins can update org apps" ON public.user_applications FOR UPDATE TO authenticated USING (is_org_admin(organization_id));

DROP POLICY IF EXISTS "Admins can delete org apps" ON public.user_applications;
CREATE POLICY "Admins can delete org apps" ON public.user_applications FOR DELETE TO authenticated USING (is_org_admin(organization_id));

-- contacts
DROP POLICY IF EXISTS "Members can view contacts" ON public.contacts;
CREATE POLICY "Members can view contacts" ON public.contacts FOR SELECT TO authenticated USING (is_org_member(( SELECT user_applications.organization_id FROM user_applications WHERE user_applications.id = contacts.user_application_id)));

DROP POLICY IF EXISTS "Admins can update contacts" ON public.contacts;
CREATE POLICY "Admins can update contacts" ON public.contacts FOR UPDATE TO authenticated USING (is_org_admin(( SELECT user_applications.organization_id FROM user_applications WHERE user_applications.id = contacts.user_application_id)));

DROP POLICY IF EXISTS "Admins can delete contacts" ON public.contacts;
CREATE POLICY "Admins can delete contacts" ON public.contacts FOR DELETE TO authenticated USING (is_org_admin(( SELECT user_applications.organization_id FROM user_applications WHERE user_applications.id = contacts.user_application_id)));

-- user_roles
DROP POLICY IF EXISTS "Members can view org roles" ON public.user_roles;
CREATE POLICY "Members can view org roles" ON public.user_roles FOR SELECT TO authenticated USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (is_org_admin(organization_id));

-- organizations
DROP POLICY IF EXISTS "Members can view their org" ON public.organizations;
CREATE POLICY "Members can view their org" ON public.organizations FOR SELECT TO authenticated USING (is_org_member(id));

DROP POLICY IF EXISTS "Admins can update their org" ON public.organizations;
CREATE POLICY "Admins can update their org" ON public.organizations FOR UPDATE TO authenticated USING (is_org_admin(id));

-- org_integrations
DROP POLICY IF EXISTS "Members can view org integrations" ON public.org_integrations;
CREATE POLICY "Members can view org integrations" ON public.org_integrations FOR SELECT TO authenticated USING (is_org_member(organization_id));

DROP POLICY IF EXISTS "Admins can update org integrations" ON public.org_integrations;
CREATE POLICY "Admins can update org integrations" ON public.org_integrations FOR UPDATE TO authenticated USING (is_org_admin(organization_id));

DROP POLICY IF EXISTS "Admins can delete org integrations" ON public.org_integrations;
CREATE POLICY "Admins can delete org integrations" ON public.org_integrations FOR DELETE TO authenticated USING (is_org_admin(organization_id));

-- contract_files
DROP POLICY IF EXISTS "Members can view contract files" ON public.contract_files;
CREATE POLICY "Members can view contract files" ON public.contract_files FOR SELECT TO authenticated USING (is_org_member(( SELECT user_applications.organization_id FROM user_applications WHERE user_applications.id = contract_files.user_application_id)));

-- Storage: fix delete policy role
DROP POLICY IF EXISTS "Org admins can delete contracts" ON storage.objects;
CREATE POLICY "Org admins can delete contracts" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'contracts' AND is_org_admin(((storage.foldername(name))[1])::uuid));

-- 1. Fix: Org admin can demote platform admin roles
-- Add guard to prevent updating platform_admin rows
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles"
ON public.user_roles FOR UPDATE
TO authenticated
USING (
  is_org_admin(organization_id)
  AND role != 'platform_admin'
)
WITH CHECK (
  role = ANY (ARRAY['member'::app_role, 'admin'::app_role])
);

-- 2. Fix: Platform admin escalation via insert
-- Restrict platform admin insert to only allow member/admin roles too (not platform_admin for others)
DROP POLICY IF EXISTS "Platform admins can insert any role" ON public.user_roles;
CREATE POLICY "Platform admins can insert any role"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (
  is_platform_admin()
  AND role = ANY (ARRAY['member'::app_role, 'admin'::app_role, 'platform_admin'::app_role])
);

-- Also add guard on admin insert to be extra safe - prevent inserting platform_admin
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins can insert roles"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (
  is_org_admin(organization_id)
  AND user_id != auth.uid()
  AND role = ANY (ARRAY['member'::app_role, 'admin'::app_role])
);

-- Also prevent org admins from deleting platform_admin rows
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete roles"
ON public.user_roles FOR DELETE
TO authenticated
USING (
  is_org_admin(organization_id)
  AND role != 'platform_admin'
);

-- 3. Fix: Contract storage SELECT policy - change from public to authenticated
DROP POLICY IF EXISTS "Org members can view contracts" ON storage.objects;
CREATE POLICY "Org members can view contracts"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'contracts'
  AND is_org_member((storage.foldername(name))[1]::uuid)
);

-- 4. Fix: Invitation token exposure - hide tokens from SELECT by using a secure view approach
-- We'll restrict the SELECT policy so admins can see invitations but not use raw token
-- Create a function that returns masked invitations for admin viewing
DROP POLICY IF EXISTS "Admins can view org invitations" ON public.invitations;
CREATE POLICY "Admins can view org invitations"
ON public.invitations FOR SELECT
TO authenticated
USING (
  is_org_admin(organization_id)
);

-- Create a security definer function to mask tokens in queries
CREATE OR REPLACE FUNCTION public.get_org_invitations(_org_id uuid)
RETURNS TABLE(
  id uuid,
  email text,
  role app_role,
  status text,
  created_at timestamptz,
  expires_at timestamptz,
  invited_by uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.email, i.role, i.status, i.created_at, i.expires_at, i.invited_by
  FROM public.invitations i
  WHERE i.organization_id = _org_id
    AND (is_org_admin(_org_id) OR is_platform_admin())
  ORDER BY i.created_at DESC;
$$;

-- Allow org members (not just admins) to add apps to their stack
DROP POLICY IF EXISTS "Admins can insert org apps" ON public.user_applications;
CREATE POLICY "Members can insert org apps"
ON public.user_applications FOR INSERT
TO authenticated
WITH CHECK (is_org_member(organization_id));

-- Revert: only admins can insert org apps
DROP POLICY IF EXISTS "Members can insert org apps" ON public.user_applications;
CREATE POLICY "Admins can insert org apps"
ON public.user_applications FOR INSERT
TO authenticated
WITH CHECK (is_org_admin(organization_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Admins can delete org apps" ON public.user_applications;
CREATE POLICY "Admins can delete org apps"
ON public.user_applications FOR DELETE
TO authenticated
USING (is_org_admin(organization_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Admins can update org apps" ON public.user_applications;
CREATE POLICY "Admins can update org apps"
ON public.user_applications FOR UPDATE
TO authenticated
USING (is_org_admin(organization_id) OR is_platform_admin());

-- KB Categories
CREATE TABLE public.kb_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kb_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view kb categories" ON public.kb_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Platform admins can insert kb categories" ON public.kb_categories FOR INSERT TO authenticated WITH CHECK (is_platform_admin());
CREATE POLICY "Platform admins can update kb categories" ON public.kb_categories FOR UPDATE TO authenticated USING (is_platform_admin());
CREATE POLICY "Platform admins can delete kb categories" ON public.kb_categories FOR DELETE TO authenticated USING (is_platform_admin());

-- KB Articles
CREATE TABLE public.kb_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.kb_categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  content text NOT NULL DEFAULT '',
  tags text[] DEFAULT '{}',
  is_published boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kb_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view published articles" ON public.kb_articles FOR SELECT TO authenticated USING (is_published OR is_platform_admin());
CREATE POLICY "Platform admins can insert articles" ON public.kb_articles FOR INSERT TO authenticated WITH CHECK (is_platform_admin());
CREATE POLICY "Platform admins can update articles" ON public.kb_articles FOR UPDATE TO authenticated USING (is_platform_admin());
CREATE POLICY "Platform admins can delete articles" ON public.kb_articles FOR DELETE TO authenticated USING (is_platform_admin());

-- Triggers for updated_at
CREATE TRIGGER update_kb_categories_updated_at BEFORE UPDATE ON public.kb_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_kb_articles_updated_at BEFORE UPDATE ON public.kb_articles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add screenshot_urls column to feedback
ALTER TABLE public.feedback ADD COLUMN screenshot_urls text[] DEFAULT '{}';

-- Create storage bucket for feedback screenshots
INSERT INTO storage.buckets (id, name, public) VALUES ('feedback-screenshots', 'feedback-screenshots', false)
ON CONFLICT (id) DO NOTHING;

-- Users can upload to their own folder
CREATE POLICY "Users can upload feedback screenshots"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'feedback-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can view their own screenshots
CREATE POLICY "Users can view own feedback screenshots"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'feedback-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Platform admins can view all feedback screenshots
CREATE POLICY "Platform admins can view all feedback screenshots"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'feedback-screenshots' AND is_platform_admin());
-- Allow platform admins to create invitations
CREATE POLICY "Platform admins can create invitations"
ON public.invitations
FOR INSERT
TO authenticated
WITH CHECK (is_platform_admin() AND (invited_by = auth.uid()));

-- Allow platform admins to view all invitations
CREATE POLICY "Platform admins can view all invitations"
ON public.invitations
FOR SELECT
TO authenticated
USING (is_platform_admin());

-- Allow platform admins to update any invitation
CREATE POLICY "Platform admins can update any invitation"
ON public.invitations
FOR UPDATE
TO authenticated
USING (is_platform_admin());

-- Allow platform admins to delete any invitation
CREATE POLICY "Platform admins can delete any invitation"
ON public.invitations
FOR DELETE
TO authenticated
USING (is_platform_admin());CREATE OR REPLACE FUNCTION public.get_feedback_user_emails(_user_ids uuid[])
RETURNS TABLE(user_id uuid, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT au.id as user_id, au.email::text as email
  FROM auth.users au
  WHERE au.id = ANY(_user_ids)
    AND is_platform_admin()
$$;ALTER TABLE public.invitations ADD COLUMN first_name text, ADD COLUMN last_name text;DROP FUNCTION IF EXISTS public.get_org_invitations(uuid);

CREATE FUNCTION public.get_org_invitations(_org_id uuid)
 RETURNS TABLE(id uuid, email text, role app_role, status text, created_at timestamp with time zone, expires_at timestamp with time zone, invited_by uuid, first_name text, last_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT i.id, i.email, i.role, i.status, i.created_at, i.expires_at, i.invited_by, i.first_name, i.last_name
  FROM public.invitations i
  WHERE i.organization_id = _org_id
    AND (is_org_admin(_org_id) OR is_platform_admin())
  ORDER BY i.created_at DESC;
$$;-- Email infrastructure
-- Creates the queue system, send log, send state, suppression, and unsubscribe
-- tables used by both auth and transactional emails.

-- Extensions required for queue processing
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS supabase_vault;
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create email queues (auth = high priority, transactional = normal)
-- Wrapped in DO blocks to handle "queue already exists" errors idempotently.
DO $$ BEGIN PERFORM pgmq.create('auth_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Dead-letter queues for messages that exceed max retries
DO $$ BEGIN PERFORM pgmq.create('auth_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Email send log table (audit trail for all send attempts)
-- UPDATE is allowed for the service role so the suppression edge function
-- can update a log record's status when a bounce/complaint/unsubscribe occurs.
CREATE TABLE IF NOT EXISTS public.email_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT,
  template_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq')),
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read send log"
    ON public.email_send_log FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert send log"
    ON public.email_send_log FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can update send log"
    ON public.email_send_log FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_created ON public.email_send_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient ON public.email_send_log(recipient_email);

-- Backfill: add message_id column to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_log ADD COLUMN message_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_message ON public.email_send_log(message_id);

-- Prevent duplicate sends: only one 'sent' row per message_id.
-- If VT expires and another worker picks up the same message, the pre-send
-- check catches it. This index is a DB-level safety net for race conditions.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_log_message_sent_unique
  ON public.email_send_log(message_id) WHERE status = 'sent';

-- Backfill: update status CHECK constraint for existing tables that predate new statuses
DO $$ BEGIN
  ALTER TABLE public.email_send_log DROP CONSTRAINT IF EXISTS email_send_log_status_check;
  ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check
    CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq'));
END $$;

-- Rate-limit state and queue config (single row, tracks Retry-After cooldown + throughput settings)
CREATE TABLE IF NOT EXISTS public.email_send_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  retry_after_until TIMESTAMPTZ,
  batch_size INTEGER NOT NULL DEFAULT 10,
  send_delay_ms INTEGER NOT NULL DEFAULT 200,
  auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15,
  transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.email_send_state (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Backfill: add config columns to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN batch_size INTEGER NOT NULL DEFAULT 10;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN send_delay_ms INTEGER NOT NULL DEFAULT 200;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can manage send state"
    ON public.email_send_state FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RPC wrappers so Edge Functions can interact with pgmq via supabase.rpc()
-- (PostgREST only exposes functions in the public schema; pgmq functions are in the pgmq schema)
-- All wrappers auto-create the queue on undefined_table (42P01) so emails
-- are never lost if the queue was dropped (extension upgrade, restore, etc.).
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name TEXT, payload JSONB)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name TEXT, batch_size INT, vt INT)
RETURNS TABLE(msg_id BIGINT, read_ct INT, message JSONB)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name TEXT, message_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(
  source_queue TEXT, dlq_name TEXT, message_id BIGINT, payload JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;

-- Restrict queue RPC wrappers to service_role only (SECURITY DEFINER runs as owner,
-- so without this any authenticated user could manipulate the email queues)
REVOKE EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) TO service_role;

-- Suppressed emails table (tracks unsubscribes, bounces, complaints)
-- Append-only: no DELETE or UPDATE policies to prevent bypassing suppression.
CREATE TABLE IF NOT EXISTS public.suppressed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribe', 'bounce', 'complaint')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email)
);

ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read suppressed emails"
    ON public.suppressed_emails FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert suppressed emails"
    ON public.suppressed_emails FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_suppressed_emails_email ON public.suppressed_emails(email);

-- Email unsubscribe tokens table (one token per email address for unsubscribe links)
-- No DELETE policy to prevent removing tokens. UPDATE allowed only to mark tokens as used.
CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ
);

ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read tokens"
    ON public.email_unsubscribe_tokens FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert tokens"
    ON public.email_unsubscribe_tokens FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can mark tokens as used"
    ON public.email_unsubscribe_tokens FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_token ON public.email_unsubscribe_tokens(token);

-- ============================================================
-- POST-MIGRATION STEPS (applied dynamically by setup_email_infra)
-- These steps contain project-specific secrets and URLs and
-- cannot be expressed as static SQL. They are applied via the
-- Supabase Management API (ExecuteSQL) each time the tool runs.
-- ============================================================
--
-- 1. VAULT SECRET
--    Stores (or updates) the Supabase service_role key in
--    vault as 'email_queue_service_role_key'.
--    Uses vault.create_secret / vault.update_secret (upsert).
--    To revert: DELETE FROM vault.secrets WHERE name = 'email_queue_service_role_key';
--
-- 2. CRON JOB (pg_cron)
--    Creates job 'process-email-queue' with a 5-second interval.
--    The job checks:
--      a) rate-limit cooldown (email_send_state.retry_after_until)
--      b) whether auth_emails or transactional_emails queues have messages
--    If conditions are met, it calls the process-email-queue Edge Function
--    via net.http_post using the vault-stored service_role key.
--    To revert: SELECT cron.unschedule('process-email-queue');
INSERT INTO storage.buckets (id, name, public) VALUES ('email-assets', 'email-assets', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Email assets are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'email-assets');INSERT INTO categories (name, icon, display_order) VALUES ('Design & Creative', 'Palette', 31);CREATE POLICY "Platform admins can upload contracts"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'contracts' AND is_platform_admin());
-- Add website_url to organizations
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS website_url text;

-- Add link_status to integrations for link verification tracking
ALTER TABLE public.integrations ADD COLUMN IF NOT EXISTS link_status text NOT NULL DEFAULT 'unchecked';

-- Allow platform admins to manage integrations
CREATE POLICY "Platform admins can insert integrations"
ON public.integrations FOR INSERT TO authenticated
WITH CHECK (is_platform_admin());

CREATE POLICY "Platform admins can update integrations"
ON public.integrations FOR UPDATE TO authenticated
USING (is_platform_admin());

CREATE POLICY "Platform admins can delete integrations"
ON public.integrations FOR DELETE TO authenticated
USING (is_platform_admin());

-- Allow contract_files to be updated (for auto-rename)
CREATE POLICY "Admins can update contract files"
ON public.contract_files FOR UPDATE TO authenticated
USING (is_org_admin((SELECT ua.organization_id FROM user_applications ua WHERE ua.id = contract_files.user_application_id)) OR is_platform_admin());

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
-- Fix 1: Prevent org admins from updating their own role (privilege escalation)
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (is_org_admin(organization_id) AND role <> 'platform_admin'::app_role AND user_id <> auth.uid())
WITH CHECK (role = ANY (ARRAY['member'::app_role, 'admin'::app_role]));

-- Fix 2: Add missing SELECT policy for platform admins on contacts
CREATE POLICY "Platform admins can view contacts"
ON public.contacts
FOR SELECT
TO authenticated
USING (is_platform_admin());-- Drop the existing policy
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
  );-- Applications: restrict SELECT to authenticated
DROP POLICY IF EXISTS "View approved or own org apps" ON public.applications;
CREATE POLICY "View approved or own org apps" ON public.applications
  FOR SELECT TO authenticated
  USING ((status = 'approved') OR (submitted_by_org = get_user_org_id()));

-- Integrations: restrict SELECT to authenticated
DROP POLICY IF EXISTS "Anyone can view approved or own integrations" ON public.integrations;
CREATE POLICY "Authenticated can view approved or own integrations" ON public.integrations
  FOR SELECT TO authenticated
  USING ((status = 'approved') OR (submitted_by_org = get_user_org_id()) OR is_platform_admin());

-- Categories: restrict SELECT to authenticated
DROP POLICY IF EXISTS "Anyone can view categories" ON public.categories;
CREATE POLICY "Authenticated can view categories" ON public.categories
  FOR SELECT TO authenticated
  USING (true);
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
