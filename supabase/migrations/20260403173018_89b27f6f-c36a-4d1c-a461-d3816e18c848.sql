
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
