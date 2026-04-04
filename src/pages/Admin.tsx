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
import { Check, X, Building2, Users, Layers, MessageSquare, BarChart3, Pencil, Trash2, Save, ArrowUpDown, KeyRound, ShieldOff, Link2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

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
  screenshot_urls: string[] | null;
  created_at: string;
  user_email?: string;
  org_name?: string;
};

type OrgItem = {
  id: string;
  name: string;
  domain: string | null;
  website_url: string | null;
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
  email: string;
  name: string;
};

function AdminScreenshot({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    supabase.storage.from('feedback-screenshots').createSignedUrl(path, 3600).then(({ data }) => {
      if (data?.signedUrl) setUrl(data.signedUrl);
    });
  }, [path]);
  if (!url) return <div className="h-20 w-20 rounded-md bg-muted animate-pulse" />;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <img src={url} alt="Screenshot" className="h-20 w-20 object-cover rounded-md border border-border hover:opacity-80 transition-opacity" />
    </a>
  );
}

type FeedbackSortKey = 'date' | 'type' | 'status';

function IntegrationsModeration() {
  const [pendingIntegrations, setPendingIntegrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPendingIntegrations();
  }, []);

  const loadPendingIntegrations = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('integrations')
      .select('*, source:applications!integrations_source_app_id_fkey(name), target:applications!integrations_target_app_id_fkey(name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (!error) setPendingIntegrations(data || []);
    setLoading(false);
  };

  const approveIntegration = async (id: string) => {
    const { error } = await supabase.from('integrations').update({ status: 'approved' } as any).eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Integration approved' });
    loadPendingIntegrations();
  };

  const rejectIntegration = async (id: string) => {
    const { error } = await supabase.from('integrations').delete().eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Integration rejected and removed' });
    loadPendingIntegrations();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Pending Integration Submissions
        </CardTitle>
        <CardDescription>Review user-submitted integrations</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
        ) : pendingIntegrations.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No pending integrations</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source App</TableHead>
                <TableHead>Target App</TableHead>
                <TableHead>Documentation</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingIntegrations.map(i => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{(i as any).source?.name || '—'}</TableCell>
                  <TableCell className="font-medium">{(i as any).target?.name || '—'}</TableCell>
                  <TableCell>
                    {i.documentation_url ? (
                      <a href={i.documentation_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm truncate block max-w-xs">
                        {i.documentation_url}
                      </a>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(i.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="outline" onClick={() => approveIntegration(i.id)}>
                      <Check className="h-3 w-3 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => rejectIntegration(i.id)}>
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
  );
}

export default function Admin() {
  const { userRole, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('users');
  const [showClosed, setShowClosed] = useState(false);
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
  const [editAppData, setEditAppData] = useState<{ name: string; description: string; category_id: string | null }>({ name: '', description: '', category_id: null });
  const [appFilter, setAppFilter] = useState<'all' | 'approved' | 'org_only'>('all');
  const [fbTypeFilter, setFbTypeFilter] = useState<'all' | 'bug' | 'idea' | 'question'>('all');
  const [fbSortKey, setFbSortKey] = useState<FeedbackSortKey>('date');
  const [fbSortAsc, setFbSortAsc] = useState(false);
  const [expandedFb, setExpandedFb] = useState<Set<string>>(new Set());
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

  useEffect(() => {
    if (userRole === 'platform_admin') loadData();
  }, [userRole]);

  const loadData = async () => {
    const [appsRes, fbRes, orgRes, roleRes, catRes] = await Promise.all([
      supabase.from('applications').select('*').order('created_at', { ascending: false }),
      supabase.from('feedback').select('*').order('created_at', { ascending: false }),
      supabase.from('organizations').select('*').order('created_at', { ascending: false }),
      supabase.from('user_roles').select('*'),
      supabase.from('categories').select('id, name').order('display_order'),
    ]);

    const apps = appsRes.data || [];
    const fb = fbRes.data || [];
    const orgData = orgRes.data || [];
    const roleData = roleRes.data || [];

    setAllApps(apps);
    setCategories(catRes.data || []);

    const orgNameMap: Record<string, string> = {};
    orgData.forEach(o => { orgNameMap[o.id] = o.name; });

    const feedbackUserIds = [...new Set(fb.map(f => f.user_id))];
    let emailMap: Record<string, string> = {};
    if (feedbackUserIds.length > 0) {
      const { data: emailData } = await supabase.rpc('get_feedback_user_emails' as any, { _user_ids: feedbackUserIds });
      if (Array.isArray(emailData)) {
        emailData.forEach((e: any) => { emailMap[e.user_id] = e.email; });
      }
    }

    setFeedback(fb.map(f => ({
      ...f,
      user_email: emailMap[f.user_id] || f.user_id.substring(0, 8) + '...',
      org_name: f.organization_id ? orgNameMap[f.organization_id] || 'Unknown' : undefined,
    })));

    const countMap: Record<string, number> = {};
    roleData.forEach(r => { countMap[r.organization_id] = (countMap[r.organization_id] || 0) + 1; });
    setOrgs(orgData.map(o => ({ ...o, user_count: countMap[o.id] || 0, website_url: (o as any).website_url || null })));

    // Fetch user emails and names for users tab
    const allUserIds = [...new Set(roleData.map(r => r.user_id))];
    let userEmailMap: Record<string, string> = {};
    if (allUserIds.length > 0) {
      const { data: ueData } = await supabase.rpc('get_feedback_user_emails' as any, { _user_ids: allUserIds });
      if (Array.isArray(ueData)) {
        ueData.forEach((e: any) => { userEmailMap[e.user_id] = e.email; });
      }
    }

    // Get all invitations to derive names
    const allInvitations: any[] = [];
    for (const org of orgData) {
      const { data: invData } = await supabase.rpc('get_org_invitations', { _org_id: org.id });
      if (invData) allInvitations.push(...invData);
    }
    const nameByEmail: Record<string, { first: string; last: string }> = {};
    allInvitations.forEach((inv: any) => {
      if (inv.email && (inv.first_name || inv.last_name)) {
        nameByEmail[inv.email.toLowerCase()] = { first: inv.first_name || '', last: inv.last_name || '' };
      }
    });

    setUsers(roleData.map(r => {
      const email = userEmailMap[r.user_id] || '';
      const invName = email ? nameByEmail[email.toLowerCase()] : undefined;
      const name = invName && (invName.first || invName.last) ? `${invName.first} ${invName.last}`.trim() : (email ? email.split('@')[0] : r.user_id.slice(0, 8) + '…');
      return {
        id: r.id,
        user_id: r.user_id,
        organization_id: r.organization_id,
        org_name: orgNameMap[r.organization_id] || 'Unknown',
        role: r.role,
        created_at: r.created_at,
        email,
        name,
      };
    }));

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
      category_id: editAppData.category_id || null,
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

  // Feedback filtering & sorting (hide closed/resolved by default)
  const filteredFeedback = (fbTypeFilter === 'all' ? feedback : feedback.filter(f => f.type === fbTypeFilter))
    .filter(f => showClosed || (f.status !== 'closed' && f.status !== 'resolved'))
    .sort((a, b) => {
      let cmp = 0;
      if (fbSortKey === 'date') cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      else if (fbSortKey === 'type') cmp = a.type.localeCompare(b.type);
      else if (fbSortKey === 'status') cmp = a.status.localeCompare(b.status);
      return fbSortAsc ? cmp : -cmp;
    });

  const toggleFbSort = (key: FeedbackSortKey) => {
    if (fbSortKey === key) setFbSortAsc(!fbSortAsc);
    else { setFbSortKey(key); setFbSortAsc(key === 'type'); }
  };

  const toggleFbExpand = (id: string) => {
    setExpandedFb(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
        <p className="text-muted-foreground">Manage the entire StackSeam platform</p>
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
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="orgs">Organizations</TabsTrigger>
          <TabsTrigger value="moderation">Apps {stats.pending > 0 && `(${stats.pending})`}</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="feedback">Support {stats.openTickets > 0 && `(${stats.openTickets})`}</TabsTrigger>
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
                      <TableHead>Category</TableHead>
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
                        <TableCell>
                          {editingApp === app.id ? (
                            <Select value={editAppData.category_id || 'none'} onValueChange={(v) => setEditAppData(prev => ({ ...prev, category_id: v === 'none' ? null : v }))}>
                              <SelectTrigger className="w-[140px] h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {categories.map(c => (
                                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {categories.find(c => c.id === app.category_id)?.name || '—'}
                            </span>
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
                                setEditAppData({ name: app.name, description: app.description || '', category_id: app.category_id });
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

        {/* INTEGRATIONS TAB */}
        <TabsContent value="integrations" className="space-y-4">
          <IntegrationsModeration />
        </TabsContent>

        <TabsContent value="feedback" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <CardTitle>User Feedback & Support</CardTitle>
                  <CardDescription>Bug reports, feature ideas, and questions from all users</CardDescription>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                    <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} className="rounded" />
                    Show Closed
                  </label>
                  <Select value={fbTypeFilter} onValueChange={(v: any) => setFbTypeFilter(v)}>
                    <SelectTrigger className="w-[130px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="bug">🐛 Bugs</SelectItem>
                      <SelectItem value="idea">💡 Ideas</SelectItem>
                      <SelectItem value="question">❓ Questions</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredFeedback.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">No feedback found</p>
              ) : (
                <ScrollArea className="h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          <Button variant="ghost" size="sm" className="gap-1 -ml-3" onClick={() => toggleFbSort('type')}>
                            Type <ArrowUpDown className="h-3 w-3" />
                          </Button>
                        </TableHead>
                        <TableHead>
                          <Button variant="ghost" size="sm" className="gap-1 -ml-3" onClick={() => toggleFbSort('status')}>
                            Status <ArrowUpDown className="h-3 w-3" />
                          </Button>
                        </TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Organization</TableHead>
                        <TableHead>
                          <Button variant="ghost" size="sm" className="gap-1 -ml-3" onClick={() => toggleFbSort('date')}>
                            Date <ArrowUpDown className="h-3 w-3" />
                          </Button>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredFeedback.map(fb => {
                        const isOpen = expandedFb.has(fb.id);
                        return (
                          <>
                            <TableRow key={fb.id} className="cursor-pointer hover:bg-accent/50" onClick={() => toggleFbExpand(fb.id)}>
                              <TableCell><Badge variant={typeColor(fb.type) as any} className="text-xs">{fb.type}</Badge></TableCell>
                              <TableCell><Badge variant={statusColor(fb.status) as any} className="text-xs">{fb.status.replace('_', ' ')}</Badge></TableCell>
                              <TableCell className="font-medium text-sm max-w-xs truncate">{fb.title}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{fb.user_email}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{fb.org_name || '—'}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{new Date(fb.created_at).toLocaleDateString()}</TableCell>
                            </TableRow>
                            {isOpen && (
                              <TableRow key={`${fb.id}-detail`}>
                                <TableCell colSpan={6} className="bg-card border-t-0 p-4">
                                  <div className="space-y-3">
                                    {fb.description && <p className="text-sm text-muted-foreground">{fb.description}</p>}
                                    {fb.screenshot_urls && fb.screenshot_urls.length > 0 && (
                                      <div className="space-y-1">
                                        <span className="text-xs font-medium text-muted-foreground">Attachments ({fb.screenshot_urls.length})</span>
                                        <div className="flex gap-2 flex-wrap">
                                          {fb.screenshot_urls.map((path, i) => (
                                            <AdminScreenshot key={i} path={path} />
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {fb.admin_response && (
                                      <div className="bg-muted rounded-md p-3 text-sm">
                                        <span className="font-medium text-xs text-muted-foreground">Admin Response:</span>
                                        <p className="mt-1">{fb.admin_response}</p>
                                      </div>
                                    )}
                                    <div className="flex items-start gap-2">
                                      <div className="flex-1 space-y-2">
                                        <Textarea
                                          placeholder="Write a response..."
                                          value={adminResponses[fb.id] || ''}
                                          onChange={e => setAdminResponses(prev => ({ ...prev, [fb.id]: e.target.value }))}
                                          className="min-h-[60px]"
                                        />
                                        <div className="flex gap-2">
                                          <Button size="sm" onClick={() => sendAdminResponse(fb.id)} disabled={!adminResponses[fb.id]?.trim()}>
                                            Reply
                                          </Button>
                                          <Select value={fb.status} onValueChange={(v) => updateFeedbackStatus(fb.id, v)}>
                                            <SelectTrigger className="w-32 h-8">
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
                                      </div>
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
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
                    <TableHead>Website</TableHead>
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
                      <TableCell className="text-sm text-muted-foreground">{org.website_url || '—'}</TableCell>
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
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map(u => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium text-sm">{u.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.email || '—'}</TableCell>
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
                        <div className="flex items-center justify-end gap-1">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" title="Reset Password"><KeyRound className="h-3 w-3" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Reset Password?</AlertDialogTitle>
                                <AlertDialogDescription>This will send a password reset email to this user.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  disabled={actionLoading[`${u.user_id}_reset_password`]}
                                  onClick={() => adminAction(u.user_id, 'reset_password')}
                                >
                                  {actionLoading[`${u.user_id}_reset_password`] ? 'Sending...' : 'Send Reset Email'}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" title="Reset 2FA"><ShieldOff className="h-3 w-3" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Reset Two-Factor Authentication?</AlertDialogTitle>
                                <AlertDialogDescription>This will remove all MFA factors. The user will need to set up 2FA again on next login.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  disabled={actionLoading[`${u.user_id}_reset_mfa`]}
                                  onClick={() => adminAction(u.user_id, 'reset_mfa')}
                                >
                                  {actionLoading[`${u.user_id}_reset_mfa`] ? 'Resetting...' : 'Reset 2FA'}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
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
                        </div>
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
