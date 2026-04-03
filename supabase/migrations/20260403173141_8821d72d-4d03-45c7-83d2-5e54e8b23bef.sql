
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
