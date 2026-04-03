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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from '@/hooks/use-toast';
import { CATEGORY_GROUPS } from '@/lib/categoryGroups';
import { Search, ExternalLink, Filter, Link2, CheckCircle2, Circle, Map as MapIcon, ChevronDown, ChevronRight, EyeOff, SkipForward } from 'lucide-react';

type StatusFilter = 'all' | 'configured' | 'pending' | 'skipped' | 'hidden';

export default function Integrations() {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight') || '';
  const initialApp = searchParams.get('app') || '';
  const [search, setSearch] = useState(initialApp);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(CATEGORY_GROUPS.map(g => g.label)));
  const [openApps, setOpenApps] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(true);

  const { orgId, userRole, user } = useAuth();
  const isAdmin = userRole === 'admin' || userRole === 'platform_admin';
  const { data: allIntegrations = [] } = useIntegrations();
  const { data: userApps = [] } = useUserApplications();
  const queryClient = useQueryClient();

  const userAppIds = useMemo(() => new Set(userApps.map(ua => ua.application_id)), [userApps]);

  const stackIntegrations = useMemo(
    () => allIntegrations.filter(i => userAppIds.has(i.source_app_id) && userAppIds.has(i.target_app_id)),
    [allIntegrations, userAppIds]
  );

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
    const map: Record<string, { id: string; is_configured: boolean; status: string; notes: string | null }> = {};
    orgIntegrations.forEach(oi => {
      map[oi.integration_id] = {
        id: oi.id,
        is_configured: oi.is_configured,
        status: (oi as any).status || (oi.is_configured ? 'configured' : 'pending'),
        notes: oi.notes,
      };
    });
    return map;
  }, [orgIntegrations]);

  const setIntegrationStatus = useMutation({
    mutationFn: async ({ integrationId, status }: { integrationId: string; status: string }) => {
      const existing = configuredMap[integrationId];
      const isConfigured = status === 'configured';
      if (existing) {
        const { error } = await supabase
          .from('org_integrations')
          .update({
            is_configured: isConfigured,
            status,
            configured_at: isConfigured ? new Date().toISOString() : null,
            configured_by: isConfigured ? user!.id : null,
          } as any)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('org_integrations')
          .insert({
            organization_id: orgId!,
            integration_id: integrationId,
            is_configured: isConfigured,
            status,
            configured_at: isConfigured ? new Date().toISOString() : null,
            configured_by: isConfigured ? user!.id : null,
          } as any);
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

  // Build category-grouped structure
  const categoryGroupedData = useMemo(() => {
    // Map each category name to its group label
    const categoryToGroup: Record<string, string> = {};
    CATEGORY_GROUPS.forEach(g => {
      g.categories.forEach(c => { categoryToGroup[c] = g.label; });
    });

    // Group integrations by category group
    type IntegrationItem = typeof stackIntegrations[0];
    type AppBucket = { appName: string; appId: string; integrations: IntegrationItem[] };
    const groups = new Map<string, Map<string, AppBucket>>();

    stackIntegrations.forEach(i => {
      const source = (i as any).source;
      const target = (i as any).target;
      const sourceCat = source?.categories?.name || 'Other';
      const targetCat = target?.categories?.name || 'Other';
      const sourceGroup = categoryToGroup[sourceCat] || 'Other';
      const targetGroup = categoryToGroup[targetCat] || 'Other';

      const addToGroup = (groupLabel: string, app: any, integration: IntegrationItem) => {
        if (!app) return;
        if (!groups.has(groupLabel)) groups.set(groupLabel, new Map());
        const appMap = groups.get(groupLabel)!;
        if (!appMap.has(app.id)) appMap.set(app.id, { appName: app.name, appId: app.id, integrations: [] });
        const bucket = appMap.get(app.id)!;
        if (!bucket.integrations.find(x => x.id === integration.id)) {
          bucket.integrations.push(integration);
        }
      };

      addToGroup(sourceGroup, source, i);
      if (targetGroup !== sourceGroup || target?.id !== source?.id) {
        addToGroup(targetGroup, target, i);
      }
    });

    // Convert to array sorted by CATEGORY_GROUPS order
    const allGroupLabels = [...CATEGORY_GROUPS.map(g => g.label), 'Other'];
    return allGroupLabels
      .filter(label => groups.has(label))
      .map(label => ({
        label,
        apps: Array.from(groups.get(label)!.values())
          .filter(app => {
            if (!search) return true;
            return app.appName.toLowerCase().includes(search.toLowerCase());
          })
          .sort((a, b) => a.appName.localeCompare(b.appName)),
      }))
      .filter(g => g.apps.length > 0);
  }, [stackIntegrations, search]);

  const filterIntegration = (i: typeof stackIntegrations[0]) => {
    const entry = configuredMap[i.id];
    const status = entry?.status || 'pending';
    if (statusFilter === 'all') return status !== 'hidden';
    return status === statusFilter;
  };

  const getStatusBadge = (integrationId: string) => {
    const entry = configuredMap[integrationId];
    const status = entry?.status || 'pending';
    switch (status) {
      case 'configured':
        return <Badge className="text-[10px]">Configured</Badge>;
      case 'skipped':
        return <Badge variant="outline" className="text-[10px] text-muted-foreground">Skipped</Badge>;
      case 'hidden':
        return <Badge variant="outline" className="text-[10px] text-muted-foreground">Hidden</Badge>;
      default:
        return <Badge variant="secondary" className="text-[10px]">Pending</Badge>;
    }
  };

  const getGroupProgress = (apps: { integrations: typeof stackIntegrations }[]) => {
    let total = 0, done = 0;
    apps.forEach(app => {
      app.integrations.forEach(i => {
        const s = configuredMap[i.id]?.status;
        if (s !== 'skipped' && s !== 'hidden') { total++; }
        if (s === 'configured') done++;
      });
    });
    return { done, total };
  };

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  };

  const toggleApp = (appId: string) => {
    setOpenApps(prev => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId); else next.add(appId);
      return next;
    });
  };

  const handleCollapseAll = () => {
    if (allExpanded) {
      setOpenGroups(new Set());
      setOpenApps(new Set());
      setAllExpanded(false);
    } else {
      setOpenGroups(new Set(CATEGORY_GROUPS.map(g => g.label)));
      setOpenApps(new Set());
      setAllExpanded(true);
    }
  };

  // Stats
  const totalIntegrations = stackIntegrations.length;
  const configuredCount = stackIntegrations.filter(i => configuredMap[i.id]?.status === 'configured').length;
  const skippedCount = stackIntegrations.filter(i => configuredMap[i.id]?.status === 'skipped').length;
  const activeCount = totalIntegrations - skippedCount;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Integrations</h1>
          <p className="text-muted-foreground text-sm">
            Manage and track integrations between your stack tools
          </p>
        </div>
        <Link to="/stack-map">
          <Button variant="outline" size="sm" className="gap-2">
            <MapIcon className="h-4 w-4" />
            Stack Map
          </Button>
        </Link>
      </div>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCount}</div>
            <p className="text-xs text-muted-foreground">integrations to manage ({skippedCount} skipped)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Configured
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{configuredCount}/{activeCount}</div>
            <p className="text-xs text-muted-foreground">integrations set up</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              <Circle className="h-4 w-4 text-muted-foreground" /> Remaining
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCount - configuredCount}</div>
            <p className="text-xs text-muted-foreground">opportunities to configure</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by app name..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={(v: StatusFilter) => setStatusFilter(v)}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All (excl. hidden)</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="configured">Configured</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
            <SelectItem value="hidden">Hidden</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={handleCollapseAll} className="gap-1 whitespace-nowrap">
          {allExpanded ? <ChevronsDownUp className="h-4 w-4" /> : <ChevronsUpDown className="h-4 w-4" />}
          {allExpanded ? 'Collapse All' : 'Expand All'}
        </Button>
      </div>

      {/* Category-grouped integrations */}
      {categoryGroupedData.length === 0 ? (
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
        <div className="space-y-4">
          {categoryGroupedData.map(group => {
            const isOpen = openGroups.has(group.label);
            const progress = getGroupProgress(group.apps);

            return (
              <Collapsible key={group.label} open={isOpen} onOpenChange={() => toggleGroup(group.label)}>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border bg-card p-4 text-left hover:bg-accent/30 transition-colors">
                  <div className="flex items-center gap-3">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className="font-semibold">{group.label}</span>
                    <Badge variant={progress.done === progress.total && progress.total > 0 ? 'default' : 'secondary'} className="text-xs">
                      {progress.done}/{progress.total}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{group.apps.length} app{group.apps.length !== 1 ? 's' : ''}</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2 pl-4">
                  {group.apps.map(app => {
                    const filteredIntegrations = app.integrations.filter(filterIntegration);
                    if (filteredIntegrations.length === 0) return null;

                    return (
                      <Card key={app.appId} className="overflow-hidden">
                        <div className="px-4 py-2 border-b bg-muted/30">
                          <span className="text-sm font-medium">{app.appName}</span>
                          <span className="text-xs text-muted-foreground ml-2">({filteredIntegrations.length})</span>
                        </div>
                        <div className="px-4 pb-3 pt-2 space-y-2">
                          {filteredIntegrations.map(i => {
                            const otherApp = (i as any).source?.id === app.appId ? (i as any).target : (i as any).source;
                            const entry = configuredMap[i.id];
                            const status = entry?.status || 'pending';
                            const isHighlighted = i.id === highlightId;

                            return (
                              <div
                                key={i.id}
                                id={`integration-${i.id}`}
                                className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                                  isHighlighted ? 'ring-2 ring-primary border-primary' :
                                  status === 'configured' ? 'bg-primary/5 border-primary/20' :
                                  status === 'skipped' ? 'opacity-60' : ''
                                }`}
                              >
                                {isAdmin && (
                                  <Checkbox
                                    checked={status === 'configured'}
                                    onCheckedChange={(checked) => {
                                      setIntegrationStatus.mutate({
                                        integrationId: i.id,
                                        status: checked ? 'configured' : 'pending',
                                      });
                                    }}
                                    disabled={setIntegrationStatus.isPending}
                                  />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">{otherApp?.name || 'Unknown'}</span>
                                    {getStatusBadge(i.id)}
                                    <Badge variant="outline" className="text-[10px]">{i.integration_type || 'unknown'}</Badge>
                                  </div>
                                  {i.description && (
                                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{i.description}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  {i.documentation_url && (
                                    <a href={i.documentation_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </a>
                                  )}
                                  {isAdmin && status !== 'skipped' && status !== 'configured' && (
                                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Skip"
                                      onClick={() => setIntegrationStatus.mutate({ integrationId: i.id, status: 'skipped' })}>
                                      <SkipForward className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {isAdmin && status !== 'hidden' && status !== 'configured' && (
                                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Hide"
                                      onClick={() => setIntegrationStatus.mutate({ integrationId: i.id, status: 'hidden' })}>
                                      <EyeOff className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {isAdmin && (status === 'skipped' || status === 'hidden') && (
                                    <Button variant="ghost" size="sm" className="h-7 text-xs"
                                      onClick={() => setIntegrationStatus.mutate({ integrationId: i.id, status: 'pending' })}>
                                      Restore
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </Card>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
}
