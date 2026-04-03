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
import { Settings as SettingsIcon, Key, Cpu, Building2, UserPlus, Users, Mail, Shield, User, X, Link2, RefreshCw } from 'lucide-react';

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

function TeamSection({ orgId, isAdmin }: { orgId: string; isAdmin: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
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

  const { data: invitations = [] } = useQuery({
    queryKey: ['invitations', orgId],
    enabled: !!orgId && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .eq('organization_id', orgId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const sendInvite = useMutation({
    mutationFn: async () => {
      const trimmed = inviteEmail.trim().toLowerCase();
      if (!trimmed) throw new Error('Email is required');
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('invitations').insert({
        organization_id: orgId,
        email: trimmed,
        role: inviteRole,
        invited_by: user!.id,
      });
      if (error) {
        if (error.code === '23505') throw new Error('An invitation for this email already exists');
        throw error;
      }
    },
    onSuccess: () => {
      toast({ title: 'Invitation sent', description: `Invited ${inviteEmail} as ${inviteRole}` });
      setInviteEmail('');
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
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 space-y-1">
                <Label htmlFor="invite-email" className="sr-only">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendInvite.mutate()}
                />
              </div>
              <Select value={inviteRole} onValueChange={(v: 'admin' | 'member') => setInviteRole(v)}>
                <SelectTrigger className="w-full sm:w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => sendInvite.mutate()} disabled={sendInvite.isPending}>
                <Mail className="h-4 w-4 mr-1" />
                Invite
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" />
            Members ({members.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {members.map(member => (
            <div key={member.id} className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  {member.role === 'admin' ? <Shield className="h-4 w-4 text-primary" /> : <User className="h-4 w-4 text-muted-foreground" />}
                </div>
                <div>
                  <p className="text-sm font-medium">{member.user_id.slice(0, 8)}…</p>
                  <p className="text-xs text-muted-foreground">Joined {new Date(member.created_at).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={member.role === 'admin' ? 'default' : 'secondary'}>{member.role}</Badge>
                {isAdmin && member.role !== 'admin' && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeMember.mutate(member.id)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {isAdmin && invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Mail className="h-5 w-5" />
              Pending Invitations ({invitations.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {invitations.map(inv => (
              <div key={inv.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Invited {new Date(inv.created_at).toLocaleDateString()} · Expires {new Date(inv.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{inv.role}</Badge>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => cancelInvite.mutate(inv.id)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function Settings() {
  const { orgId, orgName, userRole, refreshOrg } = useAuth();
  const { toast } = useToast();
  const isAdmin = userRole === 'admin';

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

      <Tabs defaultValue="company" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="ai">AI Config</TabsTrigger>
          <TabsTrigger value="connectors">Connectors</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
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

        <TabsContent value="team" className="mt-4">
          {orgId && <TeamSection orgId={orgId} isAdmin={isAdmin} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
