
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
