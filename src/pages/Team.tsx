import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { UserPlus, X, Users, Mail, Shield, User } from 'lucide-react';

export default function Team() {
  const { orgId, userRole } = useAuth();
  const isAdmin = userRole === 'admin';
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');

  // Fetch team members
  const { data: members = [] } = useQuery({
    queryKey: ['team-members', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('id, user_id, role, created_at')
        .eq('organization_id', orgId!);
      if (error) throw error;
      return data;
    },
  });

  // Fetch pending invitations
  const { data: invitations = [] } = useQuery({
    queryKey: ['invitations', orgId],
    enabled: !!orgId && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .eq('organization_id', orgId!)
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
        organization_id: orgId!,
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
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Team</h1>
        <p className="text-muted-foreground">Manage your organization members and invitations</p>
      </div>

      {/* Invite form — admin only */}
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

      {/* Current members */}
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

      {/* Pending invitations */}
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
