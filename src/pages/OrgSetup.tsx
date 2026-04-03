import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Building2, Mail, Globe } from 'lucide-react';

function extractDomain(url: string): string {
  let cleaned = url.trim().toLowerCase();
  // Remove protocol
  cleaned = cleaned.replace(/^https?:\/\//, '');
  // Remove www.
  cleaned = cleaned.replace(/^www\./, '');
  // Remove path/query/fragment
  cleaned = cleaned.split('/')[0].split('?')[0].split('#')[0];
  return cleaned;
}

export default function OrgSetup() {
  const { user, loading, orgId, createOrg, refreshOrg } = useAuth();
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [domainError, setDomainError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<{ id: string; token: string; email: string; organization_id: string; orgName?: string } | null>(null);
  const [checkingInvite, setCheckingInvite] = useState(true);

  useEffect(() => {
    if (!user?.email) { setCheckingInvite(false); return; }
    (async () => {
      const { data, error } = await supabase.rpc('find_pending_invitation' as any, { _email: user.email });
      if (!error && data && Array.isArray(data) && data.length > 0) {
        const inv = data[0] as any;
        setPendingInvite({ id: inv.id, token: inv.token, email: inv.email, organization_id: inv.organization_id, orgName: inv.org_name });
      }
      setCheckingInvite(false);
    })();
  }, [user?.email]);

  if (loading || checkingInvite) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (orgId) return <Navigate to="/" replace />;

  const handleAcceptInvite = async () => {
    if (!pendingInvite) return;
    setSubmitting(true);
    const { data, error } = await supabase.rpc('accept_invitation', { _token: pendingInvite.token });
    setSubmitting(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    const result = data as any;
    if (result?.error) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Welcome!', description: 'You have joined the organization.' });
    await refreshOrg();
  };

  const handleCreate = async () => {
    if (!name.trim() || !website.trim()) return;
    setDomainError('');
    const domain = extractDomain(website);
    if (!domain || !domain.includes('.')) {
      setDomainError('Please enter a valid website URL (e.g. acme.com)');
      return;
    }

    // Check for existing org with same domain
    const { data: existing } = await (supabase
      .from('organizations')
      .select('id, name') as any)
      .eq('domain', domain)
      .maybeSingle();

    if (existing) {
      setDomainError(`An organization with this domain already exists (${(existing as any).name}). Ask your admin for an invite instead.`);
      return;
    }

    setSubmitting(true);
    const { error } = await createOrg(name.trim(), domain);
    setSubmitting(false);
    if (error) {
      if (error.message?.includes('idx_organizations_domain')) {
        setDomainError('An organization with this domain already exists. Ask your admin for an invite.');
      } else {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4">
        {/* Pending invitation card */}
        {pendingInvite && (
          <Card className="border-primary">
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-xl">You've Been Invited!</CardTitle>
              <CardDescription>
                You've been invited to join <strong>{pendingInvite.orgName || 'an organization'}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" disabled={submitting} onClick={handleAcceptInvite}>
                {submitting ? 'Joining...' : 'Accept Invitation & Join'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Create new org */}
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <Building2 className="h-6 w-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-xl">
              {pendingInvite ? 'Or Create a New Organization' : 'Set Up Your Organization'}
            </CardTitle>
            <CardDescription>Create your team workspace to start building your stack</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization Name</Label>
              <Input id="org-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Acme MSP" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-website">Company Website</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="org-website"
                  value={website}
                  onChange={e => { setWebsite(e.target.value); setDomainError(''); }}
                  placeholder="e.g. acme.com"
                  className="pl-9"
                />
              </div>
              {domainError && (
                <p className="text-sm text-destructive">{domainError}</p>
              )}
              <p className="text-xs text-muted-foreground">
                We use your company domain to prevent duplicate organizations
              </p>
            </div>
            <Button className="w-full" disabled={submitting || !name.trim() || !website.trim()} onClick={handleCreate}>
              {submitting ? 'Creating...' : 'Create Organization'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
