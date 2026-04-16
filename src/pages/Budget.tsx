import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useUserApplications, useUpdateUserApplication } from '@/hooks/useStackData';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, TrendingUp, FileText, ArrowUpDown, Download, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ContactsSection from '@/components/ContactsSection';
import ContractsSection from '@/components/ContractsSection';
import { TermBillingFields } from '@/components/TermBillingFields';

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2, 160 60% 45%))',
  'hsl(var(--chart-3, 30 80% 55%))',
  'hsl(var(--chart-4, 280 65% 60%))',
  'hsl(var(--chart-5, 340 75% 55%))',
];

type SortKey = 'name' | 'cost_monthly' | 'cost_annual' | 'renewal_date';

export default function Budget() {
  const [searchParams] = useSearchParams();
  const initialApp = searchParams.get('app') || '';
  const initialTab = searchParams.get('tab') || 'details';
  const { orgId, userRole } = useAuth();
  const { data: userApps = [] } = useUserApplications();
  const updateApp = useUpdateUserApplication();
  const { toast } = useToast();
  const isAdmin = userRole === 'admin' || userRole === 'platform_admin';
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [editingApp, setEditingApp] = useState<any>(null);
  const [appSearch, setAppSearch] = useState(initialApp);
  const [docPreviewActive, setDocPreviewActive] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(initialTab || 'details');


  const { data: allContracts = [] } = useQuery({
    queryKey: ['all_contract_files', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const uaIds = userApps.map(ua => ua.id);
      if (uaIds.length === 0) return [];
      const { data, error } = await supabase
        .from('contract_files')
        .select('*, user_applications(application_id, applications(name))')
        .in('user_application_id', uaIds);
      if (error) throw error;
      return data;
    },
  });

  // Compute effective totals: monthly includes annual/12, annual includes monthly*12
  const totalMonthly = useMemo(() =>
    userApps.reduce((sum, ua) => {
      const m = Number(ua.cost_monthly) || 0;
      const a = Number(ua.cost_annual) || 0;
      if (m > 0) return sum + m;
      if (a > 0) return sum + a / 12;
      return sum;
    }, 0), [userApps]);
  const totalAnnual = useMemo(() =>
    userApps.reduce((sum, ua) => {
      const m = Number(ua.cost_monthly) || 0;
      const a = Number(ua.cost_annual) || 0;
      if (a > 0) return sum + a;
      if (m > 0) return sum + m * 12;
      return sum;
    }, 0), [userApps]);
  const appsWithContracts = useMemo(() => {
    const uaIdsWithContracts = new Set(allContracts.map(c => c.user_application_id));
    return uaIdsWithContracts.size;
  }, [allContracts]);
  const [renewalWindow, setRenewalWindow] = useState<30 | 60 | 90>(90);
  const upcomingRenewals = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() + renewalWindow * 24 * 60 * 60 * 1000);
    return userApps.filter(ua => {
      if (!ua.renewal_date) return false;
      const d = new Date(ua.renewal_date);
      return d >= now && d <= cutoff;
    }).length;
  }, [userApps, renewalWindow]);

  const [spendView, setSpendView] = useState<'monthly' | 'annual'>('monthly');

  const categorySpend = useMemo(() => {
    const map = new Map<string, number>();
    for (const ua of userApps) {
      const cat = (ua.applications as any)?.categories?.name || 'Uncategorized';
      const m = Number(ua.cost_monthly) || 0;
      const a = Number(ua.cost_annual) || 0;
      let cost: number;
      if (spendView === 'monthly') {
        cost = m > 0 ? m : a > 0 ? a / 12 : 0;
      } else {
        cost = a > 0 ? a : m > 0 ? m * 12 : 0;
      }
      map.set(cat, (map.get(cat) || 0) + cost);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [userApps, spendView]);

  // Map user_application_id -> has contract
  const contractByUaId = useMemo(() => {
    const map: Record<string, any[]> = {};
    allContracts.forEach(c => {
      if (!map[c.user_application_id]) map[c.user_application_id] = [];
      map[c.user_application_id].push(c);
    });
    return map;
  }, [allContracts]);

  const sortedApps = useMemo(() => {
    const items = userApps.map(ua => ({
      id: ua.id,
      name: (ua.applications as any)?.name || 'Unknown',
      category: (ua.applications as any)?.categories?.name || '—',
      cost_monthly: Number(ua.cost_monthly) || 0,
      cost_annual: Number(ua.cost_annual) || 0,
      renewal_date: ua.renewal_date,
      billing_cycle: ua.billing_cycle,
      term_months: ua.term_months,
      license_count: ua.license_count,
      notes: ua.notes,
      hasContract: !!(contractByUaId[ua.id]?.length),
      contracts: contractByUaId[ua.id] || [],
    }));
    items.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'cost_monthly') cmp = a.cost_monthly - b.cost_monthly;
      else if (sortKey === 'cost_annual') cmp = a.cost_annual - b.cost_annual;
      else if (sortKey === 'renewal_date') {
        const da = a.renewal_date ? new Date(a.renewal_date).getTime() : Infinity;
        const db = b.renewal_date ? new Date(b.renewal_date).getTime() : Infinity;
        cmp = da - db;
      }
      return sortAsc ? cmp : -cmp;
    });
    return items;
  }, [userApps, sortKey, sortAsc]);

  const filteredApps = useMemo(() => {
    if (!appSearch) return sortedApps;
    const q = appSearch.toLowerCase();
    return sortedApps.filter(a => a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q));
  }, [sortedApps, appSearch]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const handleSaveDetails = async () => {
    if (!editingApp) return;
    try {
      await updateApp.mutateAsync({
        id: editingApp.id,
        cost_monthly: editingApp.cost_monthly ? Number(editingApp.cost_monthly) : null,
        cost_annual: editingApp.cost_annual ? Number(editingApp.cost_annual) : null,
        renewal_date: editingApp.renewal_date || null,
        term_months: editingApp.term_months ? Number(editingApp.term_months) : null,
        license_count: editingApp.license_count ? Number(editingApp.license_count) : null,
        billing_cycle: editingApp.billing_cycle || null,
        notes: editingApp.notes || null,
      });
      toast({ title: 'Details saved' });
      setEditingApp(null);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleDownloadContract = async (filePath: string, fileName: string) => {
    const { data, error } = await supabase.storage.from('contracts').download(filePath);
    if (error) {
      toast({ title: 'Download failed', description: error.message, variant: 'destructive' });
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 });

  const openAppEdit = (app: typeof sortedApps[0]) => {
    setEditingApp({ ...app });
  };

  // Auto-open app dialog when arriving via deep-link (?app=HaloPSA&tab=documents)
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!initialApp || autoOpenedRef.current || sortedApps.length === 0) return;
    const match = sortedApps.find(a => a.name.toLowerCase() === initialApp.toLowerCase());
    if (match) {
      openAppEdit(match);
      autoOpenedRef.current = true;
    }
  }, [initialApp, sortedApps]);

  return (
    <div className="p-6 space-y-6">
      <div data-tour="budget-header" className="flex items-center gap-2">
        <DollarSign className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Budget & Spend</h1>
      </div>

      {/* Summary Cards */}
      <div data-tour="budget-stats" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(totalMonthly)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Annual Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(totalAnnual)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Apps with Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{appsWithContracts}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Upcoming Renewals</CardTitle>
              <div className="flex items-center gap-0.5 rounded-md border p-0.5">
                {([30, 60, 90] as const).map(w => (
                  <Button
                    key={w}
                    size="sm"
                    variant={renewalWindow === w ? 'default' : 'ghost'}
                    className="h-5 text-[10px] px-1.5"
                    onClick={() => setRenewalWindow(w)}
                  >
                    {w}d
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{upcomingRenewals}</p>
          </CardContent>
        </Card>
      </div>

      {/* Spend by Category Chart */}
      {categorySpend.length > 0 && (
        <Card data-tour="budget-chart">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5" />
                {spendView === 'monthly' ? 'Monthly' : 'Annual'} Spend by Category
              </CardTitle>
              <div className="flex items-center gap-1 rounded-lg border p-0.5">
                <Button
                  size="sm"
                  variant={spendView === 'monthly' ? 'default' : 'ghost'}
                  className="h-7 text-xs px-3"
                  onClick={() => setSpendView('monthly')}
                >
                  Monthly
                </Button>
                <Button
                  size="sm"
                  variant={spendView === 'annual' ? 'default' : 'ghost'}
                  className="h-7 text-xs px-3"
                  onClick={() => setSpendView('annual')}
                >
                  Annual
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categorySpend} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" tickFormatter={v => fmt(v)} className="text-xs" />
                <YAxis type="category" dataKey="name" width={140} className="text-xs" />
                <Tooltip
                  formatter={(v: number) => fmt(v)}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {categorySpend.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* App Spend Table */}
      <Card data-tour="budget-table">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <DollarSign className="h-5 w-5" />
            Application Spend
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search applications..."
              value={appSearch}
              onChange={e => setAppSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Button variant="ghost" size="sm" className="gap-1 -ml-3" onClick={() => toggleSort('name')}>
                      Application <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" className="gap-1 -ml-3" onClick={() => toggleSort('cost_monthly')}>
                      Monthly <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" className="gap-1 -ml-3" onClick={() => toggleSort('cost_annual')}>
                      Annual <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead>Billing</TableHead>
                  <TableHead>Licenses</TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" className="gap-1 -ml-3" onClick={() => toggleSort('renewal_date')}>
                      Renewal <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead>Documents</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredApps.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      {appSearch ? 'No applications match your search.' : 'No applications with cost data yet. Add costs in My Stack.'}
                    </TableCell>
                  </TableRow>
                ) : filteredApps.map(app => (
                  <TableRow key={app.id} className="cursor-pointer hover:bg-accent/50" onClick={() => openAppEdit(app)}>
                    <TableCell className="font-medium">{app.name}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">{app.category}</Badge></TableCell>
                    <TableCell>{app.cost_monthly ? fmt(app.cost_monthly) : '—'}</TableCell>
                    <TableCell>{app.cost_annual ? fmt(app.cost_annual) : '—'}</TableCell>
                    <TableCell className="capitalize">{app.billing_cycle || '—'}</TableCell>
                    <TableCell>{app.license_count ?? '—'}</TableCell>
                    <TableCell>{app.renewal_date ? new Date(app.renewal_date).toLocaleDateString() : '—'}</TableCell>
                    <TableCell>
                      {app.hasContract ? (
                        <div className="flex items-center gap-1">
                          <Badge variant="default" className="text-xs">Yes</Badge>
                          {app.contracts.map((c: any) => (
                            <Button key={c.id} size="icon" variant="ghost" className="h-6 w-6" title={`Download ${c.file_name}`}
                              onClick={(e) => { e.stopPropagation(); handleDownloadContract(c.file_path, c.file_name); }}>
                              <Download className="h-3 w-3" />
                            </Button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* App Edit Dialog */}
      <Dialog open={!!editingApp} onOpenChange={open => { if (!open) { setEditingApp(null); setDocPreviewActive(false); setActiveTab(initialTab || 'details'); } }}>
        <DialogContent className={`${activeTab === 'documents' && docPreviewActive ? 'max-w-5xl' : 'max-w-lg'} max-h-[85vh] flex flex-col transition-all duration-300`}>
          <DialogHeader>
            <DialogTitle>{editingApp?.name || 'Application'}</DialogTitle>
            <DialogDescription>Edit details, contacts, and contracts</DialogDescription>
          </DialogHeader>
          {editingApp && (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="contacts">Contacts</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4 pt-2">
                <ScrollArea className="max-h-[50vh]">
                  <div className="space-y-4 pr-2">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Monthly Cost ($)</Label>
                        <Input
                          type="number"
                          value={editingApp.cost_monthly || ''}
                          onChange={e => setEditingApp({ ...editingApp, cost_monthly: e.target.value })}
                          disabled={!isAdmin || editingApp.billing_cycle === 'annual'}
                          className={editingApp.billing_cycle === 'annual' ? 'opacity-50' : ''}
                        />
                        {editingApp.billing_cycle === 'annual' && (
                          <p className="text-xs text-muted-foreground">Not applicable for annual billing</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Annual Cost ($)</Label>
                        <Input type="number" value={editingApp.cost_annual || ''} onChange={e => setEditingApp({ ...editingApp, cost_annual: e.target.value })} disabled={!isAdmin} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Renewal Date</Label>
                        <Input type="date" value={editingApp.renewal_date || ''} onChange={e => setEditingApp({ ...editingApp, renewal_date: e.target.value })} disabled={!isAdmin} />
                      </div>
                      <div className="space-y-2">
                        <Label>License Count</Label>
                        <Input type="number" value={editingApp.license_count || ''} onChange={e => setEditingApp({ ...editingApp, license_count: e.target.value })} disabled={!isAdmin} />
                      </div>
                    </div>
                    <TermBillingFields
                      termMonths={editingApp.term_months ? Number(editingApp.term_months) : null}
                      billingCycle={editingApp.billing_cycle || null}
                      startDate={editingApp.start_date || null}
                      disabled={!isAdmin}
                      onChange={patch => setEditingApp({ ...editingApp, ...patch })}
                    />
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <textarea
                        className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={editingApp.notes || ''}
                        onChange={e => setEditingApp({ ...editingApp, notes: e.target.value })}
                        disabled={!isAdmin}
                      />
                    </div>
                    {isAdmin && <Button className="w-full" onClick={handleSaveDetails}>Save Details</Button>}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="contacts" className="pt-2">
                <ContactsSection userApplicationId={editingApp.id} isAdmin={isAdmin} />
              </TabsContent>

              <TabsContent value="documents" className="pt-2">
                <ContractsSection
                  userApplicationId={editingApp.id}
                  isAdmin={isAdmin}
                  onPreviewChange={setDocPreviewActive}
                  onExtractedData={(data) => {
                    const updated = { ...editingApp };
                    if (data.cost_monthly != null) updated.cost_monthly = data.cost_monthly;
                    if (data.cost_annual != null) updated.cost_annual = data.cost_annual;
                    if (data.renewal_date) updated.renewal_date = data.renewal_date;
                    if (data.term_months != null) updated.term_months = data.term_months;
                    if (data.billing_cycle) updated.billing_cycle = data.billing_cycle;
                    if (data.license_count != null) updated.license_count = data.license_count;
                    if (data.notes) updated.notes = data.notes;
                    setEditingApp(updated);
                  }}
                />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
