DROP FUNCTION IF EXISTS public.get_org_invitations(uuid);

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
$$;