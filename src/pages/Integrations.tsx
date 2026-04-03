import { useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useIntegrations, useUserApplications } from '@/hooks/useStackData';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Search, ExternalLink, Filter, Link2, CheckCircle2, Circle, Map } from 'lucide-react';

type SortField = 'source' | 'target' | 'type' | 'status';
type SortDir = 'asc' | 'desc';

export default function Integrations() {
  const [searchParams] = useSearchParams();
  const initialApp = searchParams.get('app') || '';
  const [search, setSearch] = useState(initialApp);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('source');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const { orgId, userRole, user } = useAuth();
  const isAdmin = userRole === 'admin';
  const { data: allIntegrations = [] } = useIntegrations();
  const { data: userApps = [] } = useUserApplications();
  const queryClient = useQueryClient();

  const userAppIds = useMemo(() => new Set(userApps.map(ua => ua.application_id)), [userApps]);

  // Only show integrations relevant to user's stack
  const stackIntegrations = useMemo(
    () => allIntegrations.filter(i => userAppIds.has(i.source_app_id) && userAppIds.has(i.target_app_id)),
    [allIntegrations, userAppIds]
  );

  // Fetch org_integrations for configured status
  const { data: orgIntegrations = [] } = useQuery({
    queryKey: ['org_integrations', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_integrations')
        .select('*')
        .eq('organization_id', orgId!);
      if (error) throw error;
      return data;
    },
  });

  const configuredMap = useMemo(() => {
    const map: Record<string, { id: string; is_configured: boolean; notes: string | null }> = {};
    orgIntegrations.forEach(oi => {
      map[oi.integration_id] = { id: oi.id, is_configured: oi.is_configured, notes: oi.notes };
    });
    return map;
  }, [orgIntegrations]);

  const toggleConfigured = useMutation({
    mutationFn: async (integrationId: string) => {
      const existing = configuredMap.get(integrationId);
      if (existing) {
        const newConfigured = !existing.is_configured;
        const { error } = await supabase
          .from('org_integrations')
          .update({ is_configured: newConfigured, configured_at: newConfigured ? new Date().toISOString() : null, configured_by: newConfigured ? user!.id : null })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('org_integrations')
          .insert({ organization_id: orgId!, integration_id: integrationId, is_configured: true, configured_at: new Date().toISOString(), configured_by: user!.id } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org_integrations'] });
    },
    onError: (e: any) => {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    },
  });

  // Unique integration types
  const integrationTypes = useMemo(() => {
    const types = new Set(stackIntegrations.map(i => i.integration_type).filter(Boolean));
    return Array.from(types).sort();
  }, [stackIntegrations]);

  // Filter and sort
  const filtered = useMemo(() => {
    let items = stackIntegrations.filter(i => {
      const sourceName = (i as any).source?.name?.toLowerCase() || '';
      const targetName = (i as any).target?.name?.toLowerCase() || '';
      const desc = i.description?.toLowerCase() || '';
      const q = search.toLowerCase();
      const matchesSearch = !q || sourceName.includes(q) || targetName.includes(q) || desc.includes(q);
      const matchesType = typeFilter === 'all' || i.integration_type === typeFilter;
      const configured = configuredMap.get(i.id);
      const isConfigured = configured?.is_configured || false;
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'configured' && isConfigured) || (statusFilter === 'available' && !isConfigured);
      return matchesSearch && matchesType && matchesStatus;
    });

    items.sort((a, b) => {
      let aVal = '', bVal = '';
      switch (sortField) {
        case 'source': aVal = (a as any).source?.name || ''; bVal = (b as any).source?.name || ''; break;
        case 'target': aVal = (a as any).target?.name || ''; bVal = (b as any).target?.name || ''; break;
        case 'type': aVal = a.integration_type || ''; bVal = b.integration_type || ''; break;
        case 'status':
          aVal = configuredMap.get(a.id)?.is_configured ? '1' : '0';
          bVal = configuredMap.get(b.id)?.is_configured ? '1' : '0';
          break;
      }
      const cmp = aVal.localeCompare(bVal);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return items;
  }, [stackIntegrations, search, typeFilter, statusFilter, sortField, sortDir, configuredMap]);

  const configuredCount = stackIntegrations.filter(i => configuredMap.get(i.id)?.is_configured).length;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIndicator = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Integrations</h1>
          <p className="text-muted-foreground text-sm">
            Manage and track integrations between your stack tools
          </p>
        </div>
        <Link to="/map">
          <Button variant="outline" size="sm" className="gap-2">
            <Map className="h-4 w-4" />
            Stack Map
          </Button>
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Available</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stackIntegrations.length}</div>
            <p className="text-xs text-muted-foreground">integrations in your stack</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Configured
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{configuredCount}</div>
            <p className="text-xs text-muted-foreground">integrations set up</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              <Circle className="h-4 w-4 text-muted-foreground" /> Not Configured
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stackIntegrations.length - configuredCount}</div>
            <p className="text-xs text-muted-foreground">opportunities remaining</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by app name or description..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {integrationTypes.map(t => (
              <SelectItem key={t} value={t!}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="configured">Configured</SelectItem>
            <SelectItem value="available">Not Configured</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Link2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-1">No integrations found</h3>
            <p className="text-sm text-muted-foreground">
              {stackIntegrations.length === 0
                ? 'Add more tools to your stack and discover integrations from the Stack Map.'
                : 'Try adjusting your search or filters.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                {isAdmin && <TableHead className="w-12">Done</TableHead>}
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort('source')}>
                  Source <SortIndicator field="source" />
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort('target')}>
                  Target <SortIndicator field="target" />
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort('type')}>
                  Type <SortIndicator field="type" />
                </TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Docs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(i => {
                const configured = configuredMap.get(i.id);
                const isConfigured = configured?.is_configured || false;
                return (
                  <TableRow key={i.id} className={isConfigured ? 'bg-primary/5' : ''}>
                    {isAdmin && (
                      <TableCell>
                        <Checkbox
                          checked={isConfigured}
                          onCheckedChange={() => toggleConfigured.mutate(i.id)}
                          disabled={toggleConfigured.isPending}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium whitespace-nowrap">{(i as any).source?.name}</TableCell>
                    <TableCell className="font-medium whitespace-nowrap">{(i as any).target?.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{i.integration_type || 'unknown'}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <p className="text-sm text-muted-foreground truncate">{i.description}</p>
                    </TableCell>
                    <TableCell>
                      {i.documentation_url && (
                        <a href={i.documentation_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline text-sm">
                          <ExternalLink className="h-3.5 w-3.5" />
                          Link
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
