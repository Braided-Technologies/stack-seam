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
import { useUserApplications, useUpsertUserApplicationContract } from '@/hooks/useStackData';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, TrendingUp, FileText, ArrowUpDown, Download, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ContactsSection from '@/components/ContactsSection';
import ContractsSection from '@/components/ContractsSection';
import { AppContractsEditor } from '@/components/AppContractsEditor';
import { CATEGORY_COLORS } from '@/lib/constants';

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
  const upsertContract = useUpsertUserApplicationContract();
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

  // Per-contract rollup helpers. Each user_application now has 0..N contracts;
  // the app-level totals are sums across its contracts. A missing monthly cost
  // is derived from annual/12 (and vice versa).
  const contractMonthly = (c: any) => {
    const m = Number(c?.cost_monthly) || 0;
    const a = Number(c?.cost_annual) || 0;
    if (m > 0) return m;
    if (a > 0) return a / 12;
    return 0;
  };
  const contractAnnual = (c: any) => {
    const m = Number(c?.cost_monthly) || 0;
    const a = Number(c?.cost_annual) || 0;
    if (a > 0) return a;
    if (m > 0) return m * 12;
    return 0;
  };
  // Internal overhead per contract: full cost if internal; the internal_cost_*
  // portion if bundled_passthrough; zero for direct_passthrough.
  const contractInternalMonthly = (c: any) => {
    const model = c?.billing_model || 'internal';
    if (model === 'direct_passthrough') return 0;
    if (model === 'bundled_passthrough') {
      const im = Number(c?.internal_cost_monthly) || 0;
      const ia = Number(c?.internal_cost_annual) || 0;
      if (im > 0) return im;
      if (ia > 0) return ia / 12;
      return 0;
    }
    return contractMonthly(c);
  };
  const contractInternalAnnual = (c: any) => {
    const model = c?.billing_model || 'internal';
    if (model === 'direct_passthrough') return 0;
    if (model === 'bundled_passthrough') {
      const im = Number(c?.internal_cost_monthly) || 0;
      const ia = Number(c?.internal_cost_annual) || 0;
      if (ia > 0) return ia;
      if (im > 0) return im * 12;
      return 0;
    }
    return contractAnnual(c);
  };
  const appContracts = (ua: any): any[] => ua?.user_application_contracts || [];
  const sumAcrossContracts = (ua: any, fn: (c: any) => number) =>
    appContracts(ua).reduce((s, c) => s + fn(c), 0);

  const totalMonthly = useMemo(() =>
    userApps.reduce((sum, ua: any) => sum + sumAcrossContracts(ua, contractMonthly), 0), [userApps]);
  const totalAnnual = useMemo(() =>
    userApps.reduce((sum, ua: any) => sum + sumAcrossContracts(ua, contractAnnual), 0), [userApps]);
  const internalMonthly = useMemo(() =>
    userApps.reduce((sum, ua: any) => sum + sumAcrossContracts(ua, contractInternalMonthly), 0), [userApps]);
  const internalAnnual = useMemo(() =>
    userApps.reduce((sum, ua: any) => sum + sumAcrossContracts(ua, contractInternalAnnual), 0), [userApps]);
  const appsWithContracts = useMemo(() => {
    const uaIdsWithContracts = new Set(allContracts.map(c => c.user_application_id));
    return uaIdsWithContracts.size;
  }, [allContracts]);
  const [renewalWindow, setRenewalWindow] = useState<30 | 60 | 90>(90);
  const [renewalFilterActive, setRenewalFilterActive] = useState(false);
  const upcomingRenewals = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() + renewalWindow * 24 * 60 * 60 * 1000);
    // Count each contract with an upcoming renewal separately — a vendor with
    // two contracts and two distinct renewals is two things to remember.
    let count = 0;
    for (const ua of userApps as any[]) {
      for (const c of appContracts(ua)) {
        if (!c.renewal_date) continue;
        const d = new Date(c.renewal_date);
        if (d >= now && d <= cutoff) count++;
      }
    }
    return count;
  }, [userApps, renewalWindow]);
  // Set of user_application_ids that have at least one contract renewing in
  // the selected window — used to filter the apps list when the Upcoming
  // Renewals card is clicked.
  const upcomingRenewalAppIds = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() + renewalWindow * 24 * 60 * 60 * 1000);
    const ids = new Set<string>();
    for (const ua of userApps as any[]) {
      for (const c of appContracts(ua)) {
        if (!c.renewal_date) continue;
        const d = new Date(c.renewal_date);
        if (d >= now && d <= cutoff) {
          ids.add(ua.id);
          break;
        }
      }
    }
    return ids;
  }, [userApps, renewalWindow]);

  const [spendView, setSpendView] = useState<'monthly' | 'annual'>('monthly');

  const categorySpend = useMemo(() => {
    const map = new Map<string, number>();
    for (const ua of userApps as any[]) {
      const cat = (ua.applications as any)?.categories?.name || 'Uncategorized';
      const cost = sumAcrossContracts(ua, spendView === 'monthly' ? contractMonthly : contractAnnual);
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
    const items = userApps.map((ua: any) => {
      const contracts = appContracts(ua);
      // Earliest upcoming renewal across this app's contracts — that's the one
      // most worth surfacing in the table.
      const upcomingDates = contracts
        .map(c => c.renewal_date)
        .filter(Boolean)
        .sort();
      return {
        id: ua.id,
        name: (ua.applications as any)?.name || 'Unknown',
        category: (ua.applications as any)?.categories?.name || '—',
        cost_monthly: sumAcrossContracts(ua, contractMonthly),
        cost_annual: sumAcrossContracts(ua, contractAnnual),
        renewal_date: upcomingDates[0] || null,
        contract_count: contracts.length,
        hasContract: !!(contractByUaId[ua.id]?.length),
        contracts: contractByUaId[ua.id] || [],
      };
    });
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
    let result = sortedApps;
    if (renewalFilterActive) {
      result = result.filter(a => upcomingRenewalAppIds.has(a.id));
    }
    if (appSearch) {
      const q = appSearch.toLowerCase();
      result = result.filter(a => a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q));
    }
    return result;
  }, [sortedApps, appSearch, renewalFilterActive, upcomingRenewalAppIds]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
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

  // Whole dollars render as '$1,750' (clean), non-integer amounts always
  // render with 2 decimals ('$4.40', '$502.10') so partials don't look chopped.
  const fmt = (n: number) => {
    const hasCents = Math.abs(n % 1) > 0.0001;
    return n.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2,
    });
  };

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
            {internalMonthly !== totalMonthly && (
              <p className="text-xs text-muted-foreground mt-1">
                Internal overhead: <span className="font-medium text-foreground">{fmt(internalMonthly)}</span>
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Annual Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(totalAnnual)}</p>
            {internalAnnual !== totalAnnual && (
              <p className="text-xs text-muted-foreground mt-1">
                Internal overhead: <span className="font-medium text-foreground">{fmt(internalAnnual)}</span>
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Apps with Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {appsWithContracts}
              <span className="text-muted-foreground font-normal">/{userApps.length}</span>
            </p>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-colors ${renewalFilterActive ? 'border-primary bg-primary/5' : 'hover:border-foreground/20'}`}
          onClick={() => setRenewalFilterActive(v => !v)}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setRenewalFilterActive(v => !v); } }}
          title={renewalFilterActive ? 'Click to clear filter' : 'Click to filter the list below'}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Upcoming Renewals</CardTitle>
              <div className="flex items-center gap-0.5 rounded-md border p-0.5" onClick={e => e.stopPropagation()}>
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
            {renewalFilterActive && (
              <p className="text-[11px] text-muted-foreground mt-1">Filtering list · click to clear</p>
            )}
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
                  {categorySpend.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={CATEGORY_COLORS[entry.name] || COLORS[i % COLORS.length]}
                    />
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
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/30 px-2 py-0.5 text-xs whitespace-nowrap">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: CATEGORY_COLORS[app.category] || 'hsl(210, 10%, 50%)' }}
                        />
                        {app.category}
                      </span>
                    </TableCell>
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
        <DialogContent className={`${activeTab === 'documents' && docPreviewActive ? 'max-w-5xl' : 'max-w-lg'} max-h-[85vh] flex flex-col overflow-hidden transition-all duration-300`}>
          <DialogHeader>
            <DialogTitle>{editingApp?.name || 'Application'}</DialogTitle>
            <DialogDescription>Edit details, contacts, and contracts</DialogDescription>
          </DialogHeader>
          {editingApp && (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="contacts">Contacts</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="flex-1 min-h-0 pt-2 mt-0 flex flex-col">
                <div className="flex-1 min-h-0 overflow-y-auto pr-2">
                  <div className="space-y-4 pb-4">
                    <AppContractsEditor userApplicationId={editingApp.id} disabled={!isAdmin} />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="contacts" className="pt-2">
                <ContactsSection userApplicationId={editingApp.id} isAdmin={isAdmin} />
              </TabsContent>

              <TabsContent value="documents" className="flex-1 min-h-0 pt-2 mt-0 flex flex-col">
                <div className="flex-1 min-h-0 overflow-y-auto pr-2">
                  <div className="space-y-3 pb-4">
                    <ContractsSection
                      userApplicationId={editingApp.id}
                      isAdmin={isAdmin}
                      onPreviewChange={setDocPreviewActive}
                      onExtractedData={async (data) => {
                        // Scan import either creates a new contract or updates an
                        // existing one, based on the target selector in the scan modal.
                        const targetId = data._target_contract_id;
                        const payload: any = { user_application_id: editingApp.id };
                        if (targetId && targetId !== 'new') payload.id = targetId;
                        else if (data.vendor_name) payload.label = `Imported — ${data.vendor_name}`;
                        if (data.cost_monthly != null) payload.cost_monthly = Number(data.cost_monthly);
                        if (data.cost_annual != null) payload.cost_annual = Number(data.cost_annual);
                        if (data.renewal_date) payload.renewal_date = data.renewal_date;
                        if (data.start_date) payload.start_date = data.start_date;
                        if (data.term_months != null) payload.term_months = Number(data.term_months);
                        if (data.billing_cycle) payload.billing_cycle = data.billing_cycle;
                        if (data.license_count != null) payload.license_count = Number(data.license_count);
                        if (data.notes) payload.notes = data.notes;
                        try {
                          await upsertContract.mutateAsync(payload);
                          toast({
                            title: targetId && targetId !== 'new' ? 'Contract updated' : 'Imported as new contract',
                            description: 'Review it in the Details tab to adjust cost type or edit further.',
                          });
                        } catch (e: any) {
                          toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
                        }
                      }}
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
