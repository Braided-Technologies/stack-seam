import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings as SettingsIcon, Key, Cpu, Building2, UserPlus, Users, Mail, Shield, User, X, Link2, RefreshCw, KeyRound, ShieldOff } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

const PROVIDERS = [
  { value: 'lovable', label: 'Built-in AI (default)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
];

const MODELS: Record<string, { value: string; label: string }[]> = {
  lovable: [
    { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash (Fast)' },
    { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (Best)' },
    { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini (Balanced)' },
    { value: 'openai/gpt-5', label: 'GPT-5 (Powerful)' },
  ],
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-5', label: 'GPT-5' },
  ],
  anthropic: [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
  ],
};

function ConnectorsSection() {
  const { toast } = useToast();
  const { orgId } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [scalePadKey, setScalePadKey] = useState('');
  const [scalePadKeyLoaded, setScalePadKeyLoaded] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const { data } = await supabase
        .from('org_settings')
        .select('setting_value')
        .eq('organization_id', orgId)
        .eq('setting_key', 'scalepad_api_key')
        .maybeSingle();
      if (data?.setting_value) setScalePadKey(data.setting_value);
      setScalePadKeyLoaded(true);
    })();
  }, [orgId]);

  const handleSaveKey = async () => {
    if (!orgId || !scalePadKey.trim()) return;
    setSavingKey(true);
    try {
      const { error } = await supabase
        .from('org_settings')
        .upsert({ organization_id: orgId, setting_key: 'scalepad_api_key', setting_value: scalePadKey.trim() }, { onConflict: 'organization_id,setting_key' });
      if (error) throw error;
      toast({ title: 'API key saved' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setSavingKey(false);
  };

  const handleDeleteKey = async () => {
    if (!orgId) return;
    setSavingKey(true);
    try {
      const { error } = await supabase
        .from('org_settings')
        .delete()
        .eq('organization_id', orgId)
        .eq('setting_key', 'scalepad_api_key');
      if (error) throw error;
      setScalePadKey('');
      toast({ title: 'API key removed' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setSavingKey(false);
  };

  const handleTestConnection = async () => {
    if (!scalePadKey.trim()) return;
    setTesting(true);
    try {
      const res = await fetch('https://api.scalepad.com/core/v1/clients?page_size=1', {
        headers: { 'x-api-key': scalePadKey.trim(), 'Accept': 'application/json' },
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`API returned ${res.status}: ${errText}`);
      }
      const body = await res.json();
      toast({ title: 'Connection successful', description: `Found ${body.total_count ?? body.data?.length ?? 0} clients.` });
    } catch (e: any) {
      toast({ title: 'Connection failed', description: e.message, variant: 'destructive' });
    }
    setTesting(false);
  };

  const handleScalePadSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('scalepad-sync');
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setLastResult(data);
      toast({
        title: 'ScalePad sync complete',
        description: `Matched ${data.matched} assets, updated ${data.updated} applications.`,
      });
    } catch (e: any) {
      toast({ title: 'Sync failed', description: e.message, variant: 'destructive' });
    }
    setSyncing(false);
  };

  return (
    <div className="space-y-6">
      {/* vCIO / Contract Management */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          vCIO / Contract Management
        </h3>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Link2 className="h-5 w-5" />
              ScalePad Lifecycle Manager
            </CardTitle>
            <CardDescription>
              Sync contract and asset data from ScalePad to automatically populate renewal dates, costs, and license counts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {scalePadKeyLoaded && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1"><Key className="h-3 w-3" /> API Key</Label>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={scalePadKey}
                    onChange={e => setScalePadKey(e.target.value)}
                    placeholder="Enter your ScalePad API key"
                    className="flex-1"
                  />
                  <Button size="sm" onClick={handleSaveKey} disabled={savingKey || !scalePadKey.trim()}>
                    {savingKey ? 'Saving...' : 'Save'}
                  </Button>
                  {scalePadKey && (
                    <Button size="sm" variant="destructive" onClick={handleDeleteKey} disabled={savingKey}>
                      Remove
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Your API key is stored securely and used only for ScalePad sync.</p>
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleTestConnection} disabled={testing || !scalePadKey.trim()} variant="outline" className="gap-2">
                {testing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
                {testing ? 'Testing...' : 'Test Connection'}
              </Button>
              <Button onClick={handleScalePadSync} disabled={syncing} className="gap-2">
                {syncing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {syncing ? 'Syncing...' : 'Sync from ScalePad'}
              </Button>
            </div>
            {lastResult && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                <p><strong>Total assets found:</strong> {lastResult.total_assets}</p>
                <p><strong>Matched to apps:</strong> {lastResult.matched}</p>
                <p><strong>Updated:</strong> {lastResult.updated}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SSO */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Single Sign-On (SSO)
        </h3>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5" />
              Authentication Providers
            </CardTitle>
            <CardDescription>
              Configure SSO for your organization. Google SSO is available now. Microsoft 365 SSO requires additional setup.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <span className="text-sm font-bold">G</span>
                </div>
                <div>
                  <p className="text-sm font-medium">Google Workspace / Gmail</p>
                  <p className="text-xs text-muted-foreground">Sign in with Google accounts</p>
                </div>
              </div>
              <Badge variant="secondary">Available</Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3 opacity-60">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <span className="text-sm font-bold">M</span>
                </div>
                <div>
                  <p className="text-sm font-medium">Microsoft 365 / Azure AD</p>
                  <p className="text-xs text-muted-foreground">Requires custom configuration</p>
                </div>
              </div>
              <Badge variant="outline">Coming Soon</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TeamSection({ orgId, isAdmin, orgName }: { orgId: string; isAdmin: boolean; orgName?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteLastName, setInviteLastName] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');

  const { data: members = [] } = useQuery({
    queryKey: ['team-members', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('id, user_id, role, created_at')
        .eq('organization_id', orgId);
      if (error) throw error;
      return data;
    },
  });

  const { data: memberEmails = {} } = useQuery({
    queryKey: ['member-emails', members.map(m => m.user_id)],
    enabled: members.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_feedback_user_emails', {
        _user_ids: members.map(m => m.user_id),
      });
      if (error) return {};
      const map: Record<string, string> = {};
      (data || []).forEach((r: any) => { map[r.user_id] = r.email; });
      return map;
    },
  });

  const { data: invitations = [] } = useQuery({
    queryKey: ['invitations', orgId],
    enabled: !!orgId && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_org_invitations', { _org_id: orgId })
        .eq('status', 'pending');
      if (error) throw error;
      return data;
    },
  });

  const sendInvite = useMutation({
    mutationFn: async () => {
      const trimmed = inviteEmail.trim().toLowerCase();
      if (!trimmed) throw new Error('Email is required');
      if (!inviteFirstName.trim()) throw new Error('First name is required');
      if (!inviteLastName.trim()) throw new Error('Last name is required');
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('invitations').insert({
        organization_id: orgId,
        email: trimmed,
        role: inviteRole,
        invited_by: user!.id,
        first_name: inviteFirstName.trim(),
        last_name: inviteLastName.trim(),
      } as any);
      if (error) {
        if (error.code === '23505') throw new Error('An invitation for this email already exists');
        throw error;
      }
      // Send invitation email
      await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'team-invitation',
          recipientEmail: trimmed,
          idempotencyKey: `invite-${trimmed}-${orgId}-${Date.now()}`,
          templateData: {
            firstName: inviteFirstName.trim(),
            lastName: inviteLastName.trim(),
            orgName: orgName || 'your organization',
            role: inviteRole,
            invitedByEmail: user!.email,
            signupUrl: 'https://stackseam.tech/auth',
          },
        },
      });
    },
    onSuccess: () => {
      toast({ title: 'Invitation sent', description: `Invited ${inviteFirstName} ${inviteLastName} (${inviteEmail}) as ${inviteRole}` });
      setInviteEmail('');
      setInviteFirstName('');
      setInviteLastName('');
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
    },
    onError: (e: any) => {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    },
  });

  const cancelInvite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('invitations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Invitation cancelled' });
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
    },
  });

  const removeMember = useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase.from('user_roles').delete().eq('id', roleId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Member removed' });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
    },
    onError: (e: any) => {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    },
  });

  const changeRole = useMutation({
    mutationFn: async ({ roleId, newRole }: { roleId: string; newRole: string }) => {
      const { error } = await supabase.from('user_roles').update({ role: newRole } as any).eq('id', roleId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Role updated' });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
    },
    onError: (e: any) => {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    },
  });

  const changeInviteRole = useMutation({
    mutationFn: async ({ invId, newRole }: { invId: string; newRole: string }) => {
      const { error } = await supabase.from('invitations').update({ role: newRole } as any).eq('id', invId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Invitation role updated' });
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
    },
    onError: (e: any) => {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    },
  });

  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const adminAction = async (userId: string, action: 'reset_password' | 'reset_mfa') => {
    setActionLoading(prev => ({ ...prev, [`${userId}_${action}`]: true }));
    try {
      const { data, error } = await supabase.functions.invoke('admin-user-actions', {
        body: { action, target_user_id: userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: 'Success', description: data.message });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setActionLoading(prev => ({ ...prev, [`${userId}_${action}`]: false }));
  };

  return (
    <div className="space-y-6">
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserPlus className="h-5 w-5" />
              Invite a Team Member
            </CardTitle>
            <CardDescription>
              Send an invitation. The user will need to sign up with the invited email and accept the invite.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="invite-first">First Name</Label>
                  <Input
                    id="invite-first"
                    placeholder="John"
                    value={inviteFirstName}
                    onChange={e => setInviteFirstName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="invite-last">Last Name</Label>
                  <Input
                    id="invite-last"
                    placeholder="Doe"
                    value={inviteLastName}
                    onChange={e => setInviteLastName(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="invite-email">Email</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendInvite.mutate()}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Role</Label>
                  <Select value={inviteRole} onValueChange={(v: 'admin' | 'member') => setInviteRole(v)}>
                    <SelectTrigger className="w-full sm:w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button onClick={() => sendInvite.mutate()} disabled={sendInvite.isPending || !inviteFirstName.trim() || !inviteLastName.trim() || !inviteEmail.trim()}>
                    <Mail className="h-4 w-4 mr-1" />
                    Invite
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" />
            Members ({members.length + invitations.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_1fr_1fr_auto_auto] gap-3 px-3 pb-2 border-b mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Role</span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider w-8"></span>
          </div>
          <div className="space-y-2">
            {members.map(member => (
              <div key={member.id} className="grid grid-cols-[1fr_1fr_1fr_auto_auto] gap-3 items-center rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
                    {member.role === 'admin' ? <Shield className="h-3.5 w-3.5 text-primary" /> : <User className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                  <span className="text-sm font-medium truncate">{member.user_id.slice(0, 8)}…</span>
                </div>
                <span className="text-sm text-muted-foreground truncate">—</span>
                <div>
                  <Badge variant="secondary" className="text-xs">Active</Badge>
                  <p className="text-xs text-muted-foreground mt-0.5">Joined {new Date(member.created_at).toLocaleDateString()}</p>
                </div>
                <div>
                  {member.role === 'platform_admin' ? (
                    <Badge variant="outline" className="opacity-60 cursor-not-allowed">Platform Admin</Badge>
                  ) : isAdmin ? (
                    <Select value={member.role} onValueChange={(v) => changeRole.mutate({ roleId: member.id, newRole: v })}>
                      <SelectTrigger className="w-[110px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant={member.role === 'admin' ? 'default' : 'secondary'}>{member.role}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {isAdmin && (
                    <>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Reset Password">
                            <KeyRound className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Reset Password?</AlertDialogTitle>
                            <AlertDialogDescription>This will send a password reset email to the user.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              disabled={actionLoading[`${member.user_id}_reset_password`]}
                              onClick={() => adminAction(member.user_id, 'reset_password')}
                            >
                              {actionLoading[`${member.user_id}_reset_password`] ? 'Sending...' : 'Send Reset Email'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Reset 2FA">
                            <ShieldOff className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Reset Two-Factor Authentication?</AlertDialogTitle>
                            <AlertDialogDescription>This will remove all MFA factors for this user. They will need to set up 2FA again on their next login.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              disabled={actionLoading[`${member.user_id}_reset_mfa`]}
                              onClick={() => adminAction(member.user_id, 'reset_mfa')}
                            >
                              {actionLoading[`${member.user_id}_reset_mfa`] ? 'Resetting...' : 'Reset 2FA'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                  {isAdmin && member.role !== 'admin' && member.role !== 'platform_admin' && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeMember.mutate(member.id)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {/* Pending invitations */}
            {invitations.map((inv: any) => (
              <div key={inv.id} className="grid grid-cols-[1fr_1fr_1fr_auto_auto] gap-3 items-center rounded-lg border border-dashed p-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted flex-shrink-0">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <span className="text-sm font-medium truncate">
                    {inv.first_name && inv.last_name ? `${inv.first_name} ${inv.last_name}` : '—'}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground truncate">{inv.email}</span>
                <div>
                  <Badge variant="outline" className="text-xs">Pending</Badge>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Expires {new Date(inv.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  {isAdmin ? (
                    <Select value={inv.role} onValueChange={(v) => changeInviteRole.mutate({ invId: inv.id, newRole: v })}>
                      <SelectTrigger className="w-[110px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline">{inv.role}</Badge>
                  )}
                </div>
                <div>
                  {isAdmin && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => cancelInvite.mutate(inv.id)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
export default function Settings() {
  const { orgId, orgName, userRole, refreshOrg } = useAuth();
  const { toast } = useToast();
  const isAdmin = userRole === 'admin' || userRole === 'platform_admin';

  const [companyName, setCompanyName] = useState('');
  const [savingOrg, setSavingOrg] = useState(false);
  const [provider, setProvider] = useState('lovable');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('google/gemini-3-flash-preview');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (orgName) setCompanyName(orgName);
  }, [orgName]);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const { data } = await supabase
        .from('org_settings')
        .select('setting_key, setting_value')
        .eq('organization_id', orgId)
        .in('setting_key', ['ai_provider', 'ai_api_key', 'ai_model']);
      if (data) {
        for (const s of data) {
          if (s.setting_key === 'ai_provider' && s.setting_value) setProvider(s.setting_value);
          if (s.setting_key === 'ai_api_key' && s.setting_value) setApiKey(s.setting_value);
          if (s.setting_key === 'ai_model' && s.setting_value) setModel(s.setting_value);
        }
      }
      setLoading(false);
    })();
  }, [orgId]);

  const handleSaveOrg = async () => {
    if (!orgId || !companyName.trim()) return;
    setSavingOrg(true);
    try {
      const { error } = await supabase.from('organizations').update({ name: companyName.trim() }).eq('id', orgId);
      if (error) throw error;
      await refreshOrg();
      toast({ title: 'Company name updated' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setSavingOrg(false);
  };

  const saveSetting = async (key: string, value: string) => {
    if (!orgId) return;
    const { error } = await supabase
      .from('org_settings')
      .upsert({ organization_id: orgId, setting_key: key, setting_value: value }, { onConflict: 'organization_id,setting_key' });
    if (error) throw error;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSetting('ai_provider', provider);
      await saveSetting('ai_model', model);
      if (provider !== 'lovable') {
        await saveSetting('ai_api_key', apiKey);
      }
      toast({ title: 'Settings saved', description: 'AI configuration updated successfully.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to save settings', variant: 'destructive' });
    }
    setSaving(false);
  };

  if (!isAdmin) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Settings</h1>
        <p className="text-muted-foreground">Only administrators can access settings.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <SettingsIcon className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      <Tabs defaultValue="team" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="ai">AI Config</TabsTrigger>
          <TabsTrigger value="connectors">Connectors</TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Company
              </CardTitle>
              <CardDescription>Manage your company name and organization details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Company Name</Label>
                <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. Acme MSP" maxLength={100} />
              </div>
              <Button onClick={handleSaveOrg} disabled={savingOrg || !companyName.trim() || companyName.trim() === orgName}>
                {savingOrg ? 'Saving...' : 'Update Company Name'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-5 w-5" />
                AI Configuration
              </CardTitle>
              <CardDescription>Configure the AI provider for the Research Assistant.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>AI Provider</Label>
                    <Select value={provider} onValueChange={v => { setProvider(v); setModel(MODELS[v]?.[0]?.value || ''); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PROVIDERS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {provider !== 'lovable' && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1"><Key className="h-3 w-3" /> API Key</Label>
                      <Input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={`Enter your ${provider === 'openai' ? 'OpenAI' : 'Anthropic'} API key`} />
                      <p className="text-xs text-muted-foreground">Your API key is stored securely and only used for AI research queries.</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Select value={model} onValueChange={setModel}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(MODELS[provider] || []).map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Configuration'}</Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="connectors" className="mt-4">
          <ConnectorsSection />
        </TabsContent>

        <TabsContent value="team" className="mt-4">
          {orgId && <TeamSection orgId={orgId} isAdmin={isAdmin} orgName={orgName} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
