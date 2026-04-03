import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Navigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { Check, X, Building2, Users, Layers, MessageSquare, BarChart3, Pencil, Trash2, Save } from 'lucide-react';

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

type UserItem = {
  id: string;
  user_id: string;
  organization_id: string;
  org_name: string;
  role: string;
  created_at: string;
};

export default function Admin() {
  const { userRole, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('moderation');
  const [allApps, setAllApps] = useState<PendingApp[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [orgs, setOrgs] = useState<OrgItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [stats, setStats] = useState({ orgs: 0, users: 0, apps: 0, pending: 0, openTickets: 0 });
  const [adminResponses, setAdminResponses] = useState<Record<string, string>>({});
  const [editingOrg, setEditingOrg] = useState<string | null>(null);
  const [editOrgName, setEditOrgName] = useState('');
  const [editingApp, setEditingApp] = useState<string | null>(null);
  const [editAppData, setEditAppData] = useState<{ name: string; description: string }>({ name: '', description: '' });
  const [appFilter, setAppFilter] = useState<'all' | 'approved' | 'org_only'>('all');

  useEffect(() => {
    if (userRole === 'platform_admin') loadData();
  }, [userRole]);

  const loadData = async () => {
    const [appsRes, fbRes, orgRes, roleRes] = await Promise.all([
      supabase.from('applications').select('*').order('created_at', { ascending: false }),
      supabase.from('feedback').select('*').order('created_at', { ascending: false }),
      supabase.from('organizations').select('*').order('created_at', { ascending: false }),
      supabase.from('user_roles').select('*'),
    ]);

    const apps = appsRes.data || [];
    const fb = fbRes.data || [];
    const orgData = orgRes.data || [];
    const roleData = roleRes.data || [];

    setAllApps(apps);
    setFeedback(fb);

    const countMap: Record<string, number> = {};
    roleData.forEach(r => { countMap[r.organization_id] = (countMap[r.organization_id] || 0) + 1; });
    setOrgs(orgData.map(o => ({ ...o, user_count: countMap[o.id] || 0 })));

    const orgNameMap: Record<string, string> = {};
    orgData.forEach(o => { orgNameMap[o.id] = o.name; });
    setUsers(roleData.map(r => ({
      id: r.id,
      user_id: r.user_id,
      organization_id: r.organization_id,
      org_name: orgNameMap[r.organization_id] || 'Unknown',
      role: r.role,
      created_at: r.created_at,
    })));

    const pendingCount = apps.filter(a => a.status === 'org_only').length;
    const openTickets = fb.filter(f => f.status === 'open').length;

    setStats({
      orgs: orgData.length,
      users: roleData.length,
      apps: apps.length,
      pending: pendingCount,
      openTickets,
    });
  };

  const approveApp = async (id: string) => {
    const { error } = await supabase.from('applications').update({ status: 'approved' }).eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'App approved' });
    loadData();
  };

  const deleteApp = async (id: string) => {
    const { error } = await supabase.from('applications').delete().eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'App deleted' });
    loadData();
  };

  const saveAppEdit = async (id: string) => {
    const { error } = await supabase.from('applications').update({
      name: editAppData.name,
      description: editAppData.description || null,
    }).eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setEditingApp(null);
    toast({ title: 'App updated' });
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

  const saveOrgEdit = async (id: string) => {
    if (!editOrgName.trim()) return;
    const { error } = await supabase.from('organizations').update({ name: editOrgName }).eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setEditingOrg(null);
    toast({ title: 'Organization renamed' });
    loadData();
  };

  const deleteOrg = async (id: string) => {
    const { error } = await supabase.from('organizations').delete().eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Organization deleted' });
    loadData();
  };

  const changeUserRole = async (id: string, newRole: string) => {
    const { error } = await supabase.from('user_roles').update({ role: newRole } as any).eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Role updated' });
    loadData();
  };

  const removeUser = async (id: string) => {
    const { error } = await supabase.from('user_roles').delete().eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'User removed' });
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

  const filteredApps = appFilter === 'all' ? allApps : allApps.filter(a => a.status === appFilter);

  const statCards = [
    { label: 'Organizations', value: stats.orgs, icon: Building2, tab: 'orgs' },
    { label: 'Users', value: stats.users, icon: Users, tab: 'users' },
    { label: 'Apps', value: stats.apps, icon: Layers, tab: 'moderation' },
    { label: 'Pending Apps', value: stats.pending, icon: BarChart3, tab: 'moderation', filter: 'org_only' },
    { label: 'Open Tickets', value: stats.openTickets, icon: MessageSquare, tab: 'feedback' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Platform Administration</h1>
        <p className="text-muted-foreground">Manage the entire StackMap platform</p>
      </div>

      {/* Clickable Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {statCards.map(s => (
          <Card
            key={s.label}
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => {
              setActiveTab(s.tab);
              if (s.filter) setAppFilter(s.filter as any);
            }}
          >
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="moderation">Apps {stats.pending > 0 && `(${stats.pending})`}</TabsTrigger>
          <TabsTrigger value="feedback">Support {stats.openTickets > 0 && `(${stats.openTickets})`}</TabsTrigger>
          <TabsTrigger value="orgs">Organizations</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>

        {/* APPS TAB */}
        <TabsContent value="moderation" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Applications</CardTitle>
                  <CardDescription>Manage all applications in the catalog</CardDescription>
                </div>
                <Select value={appFilter} onValueChange={(v: any) => setAppFilter(v)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="org_only">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {filteredApps.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">No apps found</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredApps.map(app => (
                      <TableRow key={app.id}>
                        <TableCell>
                          {editingApp === app.id ? (
                            <Input value={editAppData.name} onChange={e => setEditAppData(prev => ({ ...prev, name: e.target.value }))} className="h-8" />
                          ) : (
                            <span className="font-medium">{app.name}</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-xs">
                          {editingApp === app.id ? (
                            <Input value={editAppData.description} onChange={e => setEditAppData(prev => ({ ...prev, description: e.target.value }))} className="h-8" />
                          ) : (
                            <span className="text-sm text-muted-foreground truncate block">{app.description || '—'}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={app.status === 'approved' ? 'default' : 'secondary'}>{app.status}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{new Date(app.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right space-x-1">
                          {editingApp === app.id ? (
                            <>
                              <Button size="sm" variant="outline" onClick={() => saveAppEdit(app.id)}><Save className="h-3 w-3 mr-1" />Save</Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingApp(null)}>Cancel</Button>
                            </>
                          ) : (
                            <>
                              {app.status === 'org_only' && (
                                <Button size="sm" variant="outline" onClick={() => approveApp(app.id)}>
                                  <Check className="h-3 w-3 mr-1" /> Approve
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => {
                                setEditingApp(app.id);
                                setEditAppData({ name: app.name, description: app.description || '' });
                              }}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="sm" variant="ghost" className="text-destructive"><Trash2 className="h-3 w-3" /></Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete "{app.name}"?</AlertDialogTitle>
                                    <AlertDialogDescription>This will permanently remove this application from the catalog.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteApp(app.id)}>Delete</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* FEEDBACK TAB */}
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

        {/* ORGS TAB */}
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
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgs.map(org => (
                    <TableRow key={org.id}>
                      <TableCell>
                        {editingOrg === org.id ? (
                          <div className="flex gap-2">
                            <Input value={editOrgName} onChange={e => setEditOrgName(e.target.value)} className="h-8 w-48" />
                            <Button size="sm" variant="outline" onClick={() => saveOrgEdit(org.id)}><Save className="h-3 w-3" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingOrg(null)}><X className="h-3 w-3" /></Button>
                          </div>
                        ) : (
                          <span className="font-medium">{org.name}</span>
                        )}
                      </TableCell>
                      <TableCell>{org.user_count}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(org.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right space-x-1">
                        {editingOrg !== org.id && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => { setEditingOrg(org.id); setEditOrgName(org.name); }}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="ghost" className="text-destructive"><Trash2 className="h-3 w-3" /></Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete "{org.name}"?</AlertDialogTitle>
                                  <AlertDialogDescription>This will permanently delete this organization and may orphan its users. This cannot be undone.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteOrg(org.id)}>Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* USERS TAB */}
        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Users</CardTitle>
              <CardDescription>All users across all organizations</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User ID</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map(u => (
                    <TableRow key={u.id}>
                      <TableCell className="font-mono text-xs">{u.user_id.slice(0, 8)}…</TableCell>
                      <TableCell className="font-medium">{u.org_name}</TableCell>
                      <TableCell>
                        <Select value={u.role} onValueChange={(v) => changeUserRole(u.id, v)}>
                          <SelectTrigger className="w-[140px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="platform_admin">Platform Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-destructive"><Trash2 className="h-3 w-3" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove this user?</AlertDialogTitle>
                              <AlertDialogDescription>This will remove the user's role and organization access. They will need to be re-invited.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => removeUser(u.id)}>Remove</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
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
