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