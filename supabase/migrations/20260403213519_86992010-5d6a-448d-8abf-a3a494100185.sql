
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
