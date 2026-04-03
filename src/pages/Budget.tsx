import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUserApplications } from '@/hooks/useStackData';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, TrendingUp, CalendarClock, FileText, ArrowUpDown, Download, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2, 160 60% 45%))',
  'hsl(var(--chart-3, 30 80% 55%))',
  'hsl(var(--chart-4, 280 65% 60%))',
  'hsl(var(--chart-5, 340 75% 55%))',
];

type SortKey = 'name' | 'cost_monthly' | 'cost_annual' | 'renewal_date';

export default function Budget() {
  const { orgId, userRole } = useAuth();
  const { data: userApps = [] } = useUserApplications();
  const { toast } = useToast();
  const isAdmin = userRole === 'admin' || userRole === 'platform_admin';
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);

  // Fetch all contract files across org
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

  // Summary stats
  const totalMonthly = useMemo(() =>
    userApps.reduce((sum, ua) => sum + (Number(ua.cost_monthly) || 0), 0), [userApps]);
  const totalAnnual = useMemo(() =>
    userApps.reduce((sum, ua) => sum + (Number(ua.cost_annual) || 0), 0), [userApps]);
  const appsWithContracts = useMemo(() => {
    const uaIdsWithContracts = new Set(allContracts.map(c => c.user_application_id));
    return uaIdsWithContracts.size;
  }, [allContracts]);
  const upcomingRenewals = useMemo(() => {
    const now = new Date();
    const in90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    return userApps.filter(ua => {
      if (!ua.renewal_date) return false;
      const d = new Date(ua.renewal_date);
      return d >= now && d <= in90;
    }).length;
  }, [userApps]);

  // Spend by category
  const categorySpend = useMemo(() => {
    const map = new Map<string, number>();
    for (const ua of userApps) {
      const cat = (ua.applications as any)?.categories?.name || 'Uncategorized';
      const cost = Number(ua.cost_monthly) || 0;
      map.set(cat, (map.get(cat) || 0) + cost);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [userApps]);

  // Sorted app table
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

  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <DollarSign className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Budget & Spend</h1>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Apps with Contracts</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{appsWithContracts}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Renewals (90 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{upcomingRenewals}</p>
          </CardContent>
        </Card>
      </div>

      {/* Spend by Category Chart */}
      {categorySpend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5" />
              Monthly Spend by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categorySpend} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" tickFormatter={v => fmt(v)} className="text-xs" />
                <YAxis type="category" dataKey="name" width={140} className="text-xs" />
                <Tooltip formatter={(v: number) => fmt(v)} />
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <DollarSign className="h-5 w-5" />
            Application Spend
          </CardTitle>
        </CardHeader>
        <CardContent>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedApps.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No applications with cost data yet. Add costs in My Stack.
                    </TableCell>
                  </TableRow>
                ) : sortedApps.map(app => (
                  <TableRow key={app.id}>
                    <TableCell className="font-medium">{app.name}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">{app.category}</Badge></TableCell>
                    <TableCell>{app.cost_monthly ? fmt(app.cost_monthly) : '—'}</TableCell>
                    <TableCell>{app.cost_annual ? fmt(app.cost_annual) : '—'}</TableCell>
                    <TableCell className="capitalize">{app.billing_cycle || '—'}</TableCell>
                    <TableCell>{app.license_count ?? '—'}</TableCell>
                    <TableCell>{app.renewal_date ? new Date(app.renewal_date).toLocaleDateString() : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Contracts Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            All Contracts ({allContracts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allContracts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No contracts uploaded yet. Upload contracts from My Stack.</p>
          ) : (
            <div className="space-y-2">
              {allContracts.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.user_applications?.applications?.name || 'Unknown App'}
                        {c.file_size && ` · ${(c.file_size / 1024).toFixed(0)}KB`}
                      </p>
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDownloadContract(c.file_path, c.file_name)}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
