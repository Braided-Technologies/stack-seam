
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
