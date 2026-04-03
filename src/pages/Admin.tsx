import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Navigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Check, X, Building2, Users, Layers, MessageSquare, BarChart3, Trash2 } from 'lucide-react';

type PendingApp = {
  id: string;
  name: string;
  description: string | null;
  vendor_url: string | null;
  category_id: string | null;
  created_at: string;
  submitted_by_org: string | null;
  status: string;
};

type FeedbackItem = {
  id: string;
  user_id: string;
  organization_id: string | null;
  type: string;
  title: string;
  description: string | null;
  status: string;
  admin_response: string | null;
  created_at: string;
};

type OrgItem = {
  id: string;
  name: string;
  created_at: string;
  user_count: number;
};

export default function Admin() {
  const { userRole, loading } = useAuth();
  const [pendingApps, setPendingApps] = useState<PendingApp[]>([]);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [orgs, setOrgs] = useState<OrgItem[]>([]);
  const [stats, setStats] = useState({ orgs: 0, users: 0, apps: 0, pending: 0, openTickets: 0 });
  const [adminResponses, setAdminResponses] = useState<Record<string, string>>({});

  useEffect(() => {
    if (userRole === 'platform_admin') {
      loadData();
    }
  }, [userRole]);

  const loadData = async () => {
    // Load pending apps
    const { data: apps } = await supabase
      .from('applications')
      .select('*')
      .eq('status', 'org_only')
      .order('created_at', { ascending: false });
    setPendingApps(apps || []);

    // Load feedback
    const { data: fb } = await supabase
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false });
    setFeedback(fb || []);

    // Load orgs with user counts
    const { data: orgData } = await supabase.from('organizations').select('*').order('created_at', { ascending: false });
    const { data: roleData } = await supabase.from('user_roles').select('organization_id');
    
    const countMap: Record<string, number> = {};
    (roleData || []).forEach(r => {
      countMap[r.organization_id] = (countMap[r.organization_id] || 0) + 1;
    });
    
    setOrgs((orgData || []).map(o => ({ ...o, user_count: countMap[o.id] || 0 })));

    // Stats
    const { count: allApps } = await supabase.from('applications').select('*', { count: 'exact', head: true });
    const pendingCount = (apps || []).length;
    const openTickets = (fb || []).filter(f => f.status === 'open').length;
    
    setStats({
      orgs: (orgData || []).length,
      users: (roleData || []).length,
      apps: allApps || 0,
      pending: pendingCount,
      openTickets,
    });
  };

  const approveApp = async (id: string) => {
    const { error } = await supabase.from('applications').update({ status: 'approved' }).eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'App approved for global catalog' });
    loadData();
  };

  const rejectApp = async (id: string) => {
    const { error } = await supabase.from('applications').delete().eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'App removed' });
    loadData();
  };

  const updateFeedbackStatus = async (id: string, status: string) => {
    const update: Record<string, string> = { status };
    if (adminResponses[id]) update.admin_response = adminResponses[id];
    const { error } = await supabase.from('feedback').update(update).eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Feedback updated' });
    loadData();
  };

  const sendAdminResponse = async (id: string) => {
    if (!adminResponses[id]?.trim()) return;
    const { error } = await supabase.from('feedback').update({ admin_response: adminResponses[id] }).eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Response sent' });
    setAdminResponses(prev => ({ ...prev, [id]: '' }));
    loadData();
  };

  if (loading) return null;
  if (userRole !== 'platform_admin') return <Navigate to="/" replace />;

  const statusColor = (s: string) => {
    switch (s) {
      case 'open': return 'destructive';
      case 'in_progress': return 'default';
      case 'resolved': case 'closed': return 'secondary';
      default: return 'outline';
    }
  };

  const typeColor = (t: string) => {
    switch (t) {
      case 'bug': return 'destructive';
      case 'idea': return 'default';
      case 'question': return 'secondary';
      default: return 'outline';
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Platform Administration</h1>
        <p className="text-muted-foreground">Manage the entire StackMap platform</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Organizations', value: stats.orgs, icon: Building2 },
          { label: 'Users', value: stats.users, icon: Users },
          { label: 'Apps', value: stats.apps, icon: Layers },
          { label: 'Pending Apps', value: stats.pending, icon: BarChart3 },
          { label: 'Open Tickets', value: stats.openTickets, icon: MessageSquare },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="moderation">
        <TabsList>
          <TabsTrigger value="moderation">App Moderation {stats.pending > 0 && `(${stats.pending})`}</TabsTrigger>
          <TabsTrigger value="feedback">Support {stats.openTickets > 0 && `(${stats.openTickets})`}</TabsTrigger>
          <TabsTrigger value="orgs">Organizations</TabsTrigger>
        </TabsList>

        <TabsContent value="moderation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pending App Submissions</CardTitle>
              <CardDescription>Apps submitted by organizations awaiting global catalog approval</CardDescription>
            </CardHeader>
            <CardContent>
              {pendingApps.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">No pending submissions</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingApps.map(app => (
                      <TableRow key={app.id}>
                        <TableCell className="font-medium">
                          {app.name}
                          {app.vendor_url && (
                            <a href={app.vendor_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs text-primary hover:underline">↗</a>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{app.description || '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{new Date(app.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button size="sm" variant="outline" onClick={() => approveApp(app.id)}>
                            <Check className="h-3 w-3 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => rejectApp(app.id)}>
                            <X className="h-3 w-3 mr-1" /> Reject
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="feedback" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Feedback & Support</CardTitle>
              <CardDescription>Bug reports, feature ideas, and questions from all users</CardDescription>
            </CardHeader>
            <CardContent>
              {feedback.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">No feedback yet</p>
              ) : (
                <div className="space-y-4">
                  {feedback.map(fb => (
                    <Card key={fb.id} className="border">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant={typeColor(fb.type) as any}>{fb.type}</Badge>
                              <Badge variant={statusColor(fb.status) as any}>{fb.status.replace('_', ' ')}</Badge>
                              <span className="text-xs text-muted-foreground">{new Date(fb.created_at).toLocaleDateString()}</span>
                            </div>
                            <h4 className="font-medium">{fb.title}</h4>
                            {fb.description && <p className="text-sm text-muted-foreground">{fb.description}</p>}
                          </div>
                          <Select value={fb.status} onValueChange={(v) => updateFeedbackStatus(fb.id, v)}>
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="open">Open</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="resolved">Resolved</SelectItem>
                              <SelectItem value="closed">Closed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {fb.admin_response && (
                          <div className="bg-muted rounded-md p-3 text-sm">
                            <span className="font-medium text-xs text-muted-foreground">Admin Response:</span>
                            <p className="mt-1">{fb.admin_response}</p>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Textarea
                            placeholder="Write a response..."
                            value={adminResponses[fb.id] || ''}
                            onChange={e => setAdminResponses(prev => ({ ...prev, [fb.id]: e.target.value }))}
                            className="min-h-[60px]"
                          />
                          <Button size="sm" onClick={() => sendAdminResponse(fb.id)} disabled={!adminResponses[fb.id]?.trim()}>
                            Reply
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orgs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Organizations</CardTitle>
              <CardDescription>All organizations on the platform</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Users</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgs.map(org => (
                    <TableRow key={org.id}>
                      <TableCell className="font-medium">{org.name}</TableCell>
                      <TableCell>{org.user_count}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(org.created_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
