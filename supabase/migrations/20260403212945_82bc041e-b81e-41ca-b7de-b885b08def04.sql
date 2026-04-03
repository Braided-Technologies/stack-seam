
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
