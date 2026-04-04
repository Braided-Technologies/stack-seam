CREATE OR REPLACE FUNCTION public.get_feedback_user_emails(_user_ids uuid[])
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
$$;