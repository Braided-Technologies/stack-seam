import { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatCompactCurrency } from '@/lib/formatters';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useCategories, useApplications, useUserApplications, useAddUserApplication, useRemoveUserApplication, useUpdateUserApplication, useIntegrations, useDiscoverIntegrations, useDeepScanIntegrations, useStartDiscoveryJob, useDiscoveryJob, useActiveDiscoveryJob, useReportIntegration } from '@/hooks/useStackData';
import SearchToolDialog from '@/components/SearchToolDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import { CATEGORY_COLORS } from '@/lib/constants';
import { CATEGORY_GROUPS } from '@/lib/categoryGroups';
import { Plus, Check, X, ChevronDown, ChevronUp, Settings, Search, Filter, Download, Layers, DollarSign, FolderOpen, ExternalLink, Map as MapIcon, ChevronsDownUp, ChevronsUpDown, Loader2, Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ContactsSection from '@/components/ContactsSection';
import ContractsSection from '@/components/ContractsSection';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CategoryCombobox } from '@/components/ui/category-combobox';

type FilterMode = 'all' | 'selected' | 'available';

export default function Stack() {
  const queryClient = useQueryClient();
  const { data: categories = [] } = useCategories();
  const { data: applications = [] } = useApplications();
  const { data: userApps = [] } = useUserApplications();
  const { data: allIntegrations = [], refetch: refetchIntegrations } = useIntegrations();
  const addApp = useAddUserApplication();
  const removeApp = useRemoveUserApplication();
  const updateApp = useUpdateUserApplication();
  const discoverIntegrations = useDiscoverIntegrations();
  const deepScan = useDeepScanIntegrations();
  const startJob = useStartDiscoveryJob();
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const { data: activeJob } = useDiscoveryJob(activeJobId);
  const reportIntegration = useReportIntegration();
  const { userRole, orgId } = useAuth();

  // Hydrate activeJobId from the cross-page active-job hook when we don't have
  // one locally. Keeps the progress panel visible across page reloads / nav.
  const { data: hydratedJob } = useActiveDiscoveryJob(orgId);
  useEffect(() => {
    if (!activeJobId && hydratedJob?.id) {
      setActiveJobId(hydratedJob.id);
    }
  }, [activeJobId, hydratedJob?.id]);
  const isAdmin = userRole === 'admin' || userRole === 'platform_admin';
  const navigate = useNavigate();

  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [editingApp, setEditingApp] = useState<any>(null);
  const [infoApp, setInfoApp] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [searchToolOpen, setSearchToolOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [defaultTab, setDefaultTab] = useState('overview');

  const toggleGroup = (label: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const allGroupLabels = CATEGORY_GROUPS.map(g => g.label);
  const allCollapsed = allGroupLabels.length > 0 && allGroupLabels.every(l => collapsedGroups.has(l));

  const toggleCollapseAll = () => {
    if (allCollapsed) {
      setCollapsedGroups(new Set());
    } else {
      setCollapsedGroups(new Set(allGroupLabels));
    }
  };

  const userAppMap = new Map(userApps.map(ua => [ua.application_id, ua]));
  const userAppIds = useMemo(() => new Set(userApps.map(ua => ua.application_id)), [userApps]);

  // Summary stats
  const summary = useMemo(() => {
    const totalApps = userApps.length;
    const totalMonthly = userApps.reduce((sum, ua) => sum + (Number(ua.cost_monthly) || 0), 0);
    const totalAnnual = userApps.reduce((sum, ua) => sum + (Number(ua.cost_annual) || 0), 0);
    const catsUsed = new Set(userApps.map(ua => (ua as any).applications?.categories?.name).filter(Boolean)).size;
    return { totalApps, totalMonthly, totalAnnual, catsUsed };
  }, [userApps]);

  // Get integrations for info app
  const infoAppIntegrations = useMemo(() => {
    if (!infoApp) return [];
    return allIntegrations.filter(
      (i: any) => i.source_app_id === infoApp.id || i.target_app_id === infoApp.id
    ).map((i: any) => {
      const otherApp = i.source_app_id === infoApp.id ? i.target : i.source;
      const inStack = otherApp ? userAppIds.has(otherApp.id) : false;
      return { ...i, otherApp, inStack };
    });
  }, [infoApp, allIntegrations, userAppIds]);

  // When a job completes, refetch integrations and show a toast
  useEffect(() => {
    if (!activeJob) return;
    if (activeJob.status === 'completed') {
      refetchIntegrations();
      toast({
        title: 'Discovery complete',
        description: `Found ${activeJob.found_count} integration${activeJob.found_count === 1 ? '' : 's'} across ${activeJob.processed_pairs} pair${activeJob.processed_pairs === 1 ? '' : 's'}.`,
      });
      setActiveJobId(null);
    } else if (activeJob.status === 'failed') {
      toast({ title: 'Discovery failed', description: activeJob.error_message || 'Unknown error', variant: 'destructive' });
      setActiveJobId(null);
    }
  }, [activeJob?.status]);

  const handleDiscoverForInfoApp = async () => {
    if (!infoApp || !orgId) return;
    if (userApps.length < 2) {
      toast({ title: 'Need at least 2 apps', description: 'Add more apps to your stack first.', variant: 'destructive' });
      return;
    }
    try {
      const job = await startJob.mutateAsync({
        organizationId: orgId,
        jobType: 'deep_scan',
        focusAppId: infoApp.id,
      });
      setActiveJobId(job.id);
      toast({ title: 'Discovery started', description: `Scanning integrations for ${infoApp.name}…` });
    } catch (e: any) {
      toast({ title: 'Failed to start discovery', description: e.message, variant: 'destructive' });
    }
  };

  const handleDeepScanForInfoApp = handleDiscoverForInfoApp;

  const handleFullStackScan = async () => {
    if (!orgId) return;
    if (userApps.length < 2) {
      toast({ title: 'Need at least 2 apps', description: 'Add more apps to your stack first.', variant: 'destructive' });
      return;
    }
    try {
      const job = await startJob.mutateAsync({
        organizationId: orgId,
        jobType: 'full_scan',
      });
      setActiveJobId(job.id);
      toast({ title: 'Full scan started', description: `Scanning ${userApps.length} apps for integrations…` });
    } catch (e: any) {
      toast({ title: 'Failed to start scan', description: e.message, variant: 'destructive' });
    }
  };

  const handleAdd = async (appId: string) => {
    try {
      await addApp.mutateAsync(appId);
      toast({ title: 'Added to stack' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleRemove = async (uaId: string) => {
    try {
      await removeApp.mutateAsync(uaId);
      toast({ title: 'Removed from stack' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
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
      setInfoApp(null);
      setEditingApp(null);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleExportCSV = () => {
    const rows = [['Application', 'Category', 'Monthly Cost', 'Annual Cost', 'Billing Cycle', 'Renewal Date', 'Term (Months)', 'License Count', 'Notes']];
    for (const ua of userApps) {
      const app = (ua as any).applications;
      const catName = app?.categories?.name || '';
      rows.push([
        app?.name || '',
        catName,
        ua.cost_monthly?.toString() || '',
        ua.cost_annual?.toString() || '',
        ua.billing_cycle || '',
        ua.renewal_date || '',
        ua.term_months?.toString() || '',
        ua.license_count?.toString() || '',
        (ua.notes || '').replace(/"/g, '""'),
      ]);
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stack-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Stack exported as CSV' });
  };

  const catMap = new Map(categories.map(c => [c.name, c]));

  const handleAppClick = (app: any) => {
    const cat = categories.find(c => c.id === app.category_id);
    setDefaultTab('overview');
    setInfoApp({
      id: app.id,
      name: app.name,
      description: app.description,
      vendor_url: app.vendor_url,
      category: cat?.name || 'Uncategorized',
      category_id: app.category_id,
    });
  };

  const renderCategory = (cat: typeof categories[0]) => {
    const catApps = applications.filter(a => a.category_id === cat.id);
    const filteredApps = catApps.filter(a => {
      const matchesSearch = !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.description?.toLowerCase().includes(search.toLowerCase());
      const isSelected = userAppMap.has(a.id);
      const matchesFilter = filterMode === 'all' || (filterMode === 'selected' && isSelected) || (filterMode === 'available' && !isSelected);
      return matchesSearch && matchesFilter;
    });
    if (filteredApps.length === 0) return null;
    const selectedInCat = filteredApps.filter(a => userAppMap.has(a.id));
    const isExpanded = expandedCategory === cat.id || !!search;
    const color = CATEGORY_COLORS[cat.name] || 'hsl(221, 83%, 53%)';

    return (
      <div key={cat.id} className="overflow-hidden rounded-xl border bg-card/50" style={{ borderLeftWidth: '3px', borderLeftColor: color }}>
        <button
          className="flex w-full items-center justify-between p-3 text-left transition-colors hover:bg-accent/30"
          onClick={() => setExpandedCategory(isExpanded ? null : cat.id)}
        >
          <div className="flex min-w-0 items-center gap-2">
            <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <span className="truncate font-semibold text-sm">{cat.name}</span>
            {selectedInCat.length > 0 && (
              <Badge variant="secondary" className="text-xs">{selectedInCat.length}</Badge>
            )}
          </div>
          {isExpanded ? <ChevronUp className="h-3.5 w-3.5 flex-shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />}
        </button>

        {isExpanded && (
          <div className="border-t px-3 py-3">
            <div className="grid gap-1.5">
              {filteredApps.map(app => {
                const userApp = userAppMap.get(app.id);
                const isSelected = !!userApp;

                return (
                  <div
                    key={app.id}
                    className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border p-2 transition-colors cursor-pointer hover:bg-accent/20 ${isSelected ? 'border-primary/30 bg-primary/5' : 'bg-background/50'}`}
                    onClick={() => handleAppClick(app)}
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className="min-w-0 truncate font-medium text-sm">{app.name}</p>
                        {app.vendor_url && (
                          <a
                            href={app.vendor_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 text-muted-foreground hover:text-primary"
                            onClick={e => e.stopPropagation()}
                            title="Visit vendor website"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      {app.description && (
                        <p className="truncate pr-1 text-xs text-muted-foreground">{app.description}</p>
                      )}
                    </div>

                    <div className="flex flex-shrink-0 items-center gap-1 self-center pl-1" onClick={e => e.stopPropagation()}>
                      {isSelected && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => {
                            handleAppClick(app);
                            setDefaultTab('settings');
                          }}
                        >
                          <Settings className="h-3 w-3" />
                        </Button>
                      )}
                      {isAdmin && (
                        isSelected ? (
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => handleRemove(userApp!.id)}>
                            <X className="h-3 w-3" />
                          </Button>
                        ) : (
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleAdd(app.id)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        )
                      )}
                      {isSelected && <Check className="h-3.5 w-3.5 flex-shrink-0 text-primary" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const groupedCatNames = new Set(CATEGORY_GROUPS.flatMap(g => g.categories));
  const ungroupedCats = categories.filter(c => !groupedCatNames.has(c.name));

  return (
    <div className="min-w-0 overflow-x-hidden p-6 space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div data-tour="stack-header" className="min-w-0">
          <h1 className="text-2xl font-bold">My Stack</h1>
          <p className="text-muted-foreground text-sm">Select the tools in your IT stack by category</p>
        </div>
        <div data-tour="stack-actions" className="flex flex-wrap gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setSearchToolOpen(true)}>
              <Search className="mr-2 h-4 w-4" />
              Find a Tool
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={userApps.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary bar */}
      {userApps.length > 0 && (
        <div data-tour="stack-summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Layers className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary.totalApps}</p>
              <p className="text-xs text-muted-foreground">Total Apps</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatCompactCurrency(summary.totalMonthly)}</p>
              <p className="text-xs text-muted-foreground">Monthly Spend</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatCompactCurrency(summary.totalAnnual)}</p>
              <p className="text-xs text-muted-foreground">Annual Spend</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <FolderOpen className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary.catsUsed}</p>
              <p className="text-xs text-muted-foreground">Categories</p>
            </div>
          </div>
        </div>
      )}

      <div data-tour="stack-search" className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search apps across all categories..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterMode} onValueChange={(v: FilterMode) => setFilterMode(v)}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Apps</SelectItem>
            <SelectItem value="selected">In My Stack</SelectItem>
            <SelectItem value="available">Not Selected</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={toggleCollapseAll} className="gap-1 whitespace-nowrap">
          {allCollapsed ? <ChevronsUpDown className="h-4 w-4" /> : <ChevronsDownUp className="h-4 w-4" />}
          {allCollapsed ? 'Expand All' : 'Collapse All'}
        </Button>
      </div>

      {/* Grouped category layout */}
      <div data-tour="stack-categories" className="grid gap-6 2xl:grid-cols-2">
        {CATEGORY_GROUPS.map(group => {
          const groupCats = group.categories.map(name => catMap.get(name)).filter(Boolean) as typeof categories;
          const renderedCats = groupCats.map(cat => renderCategory(cat)).filter(Boolean);
          if (renderedCats.length === 0) return null;

          const selectedCount = groupCats.reduce((sum, cat) => {
            const catApps = applications.filter(a => a.category_id === cat.id);
            return sum + catApps.filter(a => userAppMap.has(a.id)).length;
          }, 0);

          return (
            <div key={group.label} className="space-y-3">
              <button
                className="group flex w-full items-center gap-2 px-1 text-left"
                onClick={() => toggleGroup(group.label)}
              >
                <div className="flex flex-1 items-center gap-2 min-w-0">
                  <h2 className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </h2>
                  <Badge variant="outline" className="text-xs font-normal">
                    {selectedCount} selected
                  </Badge>
                </div>
                {collapsedGroups.has(group.label)
                  ? <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                  : <ChevronUp className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                }
              </button>
              {!collapsedGroups.has(group.label) && (
                <div className="grid gap-3">
                  {renderedCats}
                </div>
              )}
            </div>
          );
        })}

        {ungroupedCats.length > 0 && (
          <div className="space-y-3">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Other
            </h2>
            <div className="grid gap-3">
              {ungroupedCats.map(cat => renderCategory(cat))}
            </div>
          </div>
        )}
      </div>

      {/* App info dialog */}
      <Dialog open={!!infoApp} onOpenChange={open => !open && setInfoApp(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {infoApp?.name}
              {infoApp && userAppIds.has(infoApp.id) && <Check className="h-4 w-4 text-primary" />}
            </DialogTitle>
            <DialogDescription>{infoApp?.category}</DialogDescription>
          </DialogHeader>
          {infoApp && (() => {
            const userApp = userAppMap.get(infoApp.id);
            const isInStack = !!userApp;
            return (
              <Tabs defaultValue={defaultTab} key={defaultTab} className="flex flex-col flex-1 min-h-0">
                <TabsList className={`grid w-full ${isInStack ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="integrations">
                    Integrations ({infoAppIntegrations.length})
                  </TabsTrigger>
                  {isInStack && <TabsTrigger value="settings">Settings</TabsTrigger>}
                </TabsList>

                <TabsContent value="overview" className="space-y-4 pt-2 overflow-y-auto">
                  {infoApp.description && (
                    <p className="text-sm text-muted-foreground">{infoApp.description}</p>
                  )}
                  {!infoApp.description && (
                    <p className="text-sm text-muted-foreground italic">No description available.</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {isAdmin ? (
                      <CategoryCombobox
                        categories={categories}
                        value={infoApp.category_id || ''}
                        onChange={async (newCatId) => {
                          const { error } = await supabase
                            .from('applications')
                            .update({ category_id: newCatId })
                            .eq('id', infoApp.id);
                          if (error) {
                            toast({ title: 'Error', description: error.message, variant: 'destructive' });
                          } else {
                            const catName = categories.find(c => c.id === newCatId)?.name || '';
                            setInfoApp({ ...infoApp, category: catName, category_id: newCatId });
                            queryClient.invalidateQueries({ queryKey: ['applications'] });
                            toast({ title: `Category updated to ${catName}` });
                          }
                        }}
                        triggerClassName="h-7 w-auto min-w-[160px] text-xs"
                      />
                    ) : (
                      <Badge variant="secondary">{infoApp.category}</Badge>
                    )}
                    {isInStack && <Badge variant="default">In Your Stack</Badge>}
                  </div>
                  <div className="flex gap-2 pt-2">
                    {infoApp.vendor_url && (
                      <a href={infoApp.vendor_url} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm" className="gap-1">
                          <ExternalLink className="h-3.5 w-3.5" />
                          Visit Website
                        </Button>
                      </a>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => {
                        setInfoApp(null);
                        navigate('/stack-map');
                      }}
                    >
                      <MapIcon className="h-3.5 w-3.5" />
                      View on Stack Map
                    </Button>
                    {isAdmin && !isInStack && (
                      <Button size="sm" className="gap-1" onClick={() => { handleAdd(infoApp.id); setInfoApp(null); }}>
                        <Plus className="h-3.5 w-3.5" />
                        Add to Stack
                      </Button>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="integrations" className="pt-2 flex-1 flex flex-col overflow-hidden">
                  {userApps.length > 0 && (
                    <div className="mb-3 flex-shrink-0 space-y-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="gap-2 w-full"
                        disabled={!!activeJobId || startJob.isPending}
                        onClick={handleDiscoverForInfoApp}
                      >
                        {activeJobId || startJob.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Search className="h-3.5 w-3.5" />
                        )}
                        {activeJobId ? 'Scanning…' : infoAppIntegrations.length === 0 ? 'Discover Integrations' : 'Re-scan Integrations'}
                      </Button>
                      {activeJob && activeJob.status === 'running' && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Progress</span>
                            <span>{activeJob.processed_pairs} / {activeJob.total_pairs} pairs</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all duration-500"
                              style={{ width: `${activeJob.total_pairs > 0 ? (activeJob.processed_pairs / activeJob.total_pairs) * 100 : 0}%` }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground text-center">
                            Found {activeJob.found_count} so far…
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  {infoAppIntegrations.length === 0 ? (
                    <div className="py-4 space-y-3">
                      <p className="text-sm text-muted-foreground">
                        No integrations discovered yet for {infoApp.name}.
                      </p>
                      {userApps.length === 0 && (
                        <p className="text-xs text-muted-foreground">Add apps to your stack first, then check for integrations.</p>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 min-h-0 overflow-y-auto">
                      <div className="space-y-2 pr-2">
                        {infoAppIntegrations.map((integ: any) => {
                          const confidence = integ.confidence ?? 50;
                          const confidenceColor = confidence >= 80 ? 'text-green-500' : confidence >= 60 ? 'text-yellow-500' : 'text-orange-500';
                          const confidenceLabel = confidence >= 80 ? 'High confidence' : confidence >= 60 ? 'Medium confidence' : 'Low confidence';
                          return (
                            <div key={integ.id} className="rounded-lg border p-3 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{integ.otherApp?.name || 'Unknown'}</span>
                                  {integ.inStack && (
                                    <Badge variant="default" className="text-[10px] px-1.5 py-0">In Stack</Badge>
                                  )}
                                </div>
                                <Badge variant="outline" className="text-xs">
                                  {integ.integration_type || 'unknown'}
                                </Badge>
                              </div>
                              {integ.description && (
                                <p className="text-xs text-muted-foreground">{integ.description}</p>
                              )}
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2">
                                  {integ.documentation_url && (
                                    <a
                                      href={integ.documentation_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                      Documentation
                                    </a>
                                  )}
                                  <span className={`text-[10px] ${confidenceColor}`} title={confidenceLabel}>
                                    ● {confidence}%
                                  </span>
                                  {integ.link_status === 'dead' && (
                                    <span className="text-[10px] text-destructive">⚠ Dead link</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-0.5">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    title="Confirm this works"
                                    onClick={() => reportIntegration.mutate({ integrationId: integ.id, vote: 'upvote' })}
                                  >
                                    <Check className="h-3 w-3 text-green-500" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    title="Report as incorrect"
                                    onClick={() => reportIntegration.mutate({ integrationId: integ.id, vote: 'report' })}
                                  >
                                    <X className="h-3 w-3 text-destructive" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </TabsContent>

                {isInStack && (
                  <TabsContent value="settings" className="pt-2 overflow-y-auto max-h-[60vh]">
                      <div className="space-y-6 pr-2">
                        {/* Details */}
                        <div className="space-y-4">
                          <p className="text-sm font-medium">Details</p>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Monthly Cost ($)</Label>
                              <Input type="number" value={editingApp?.cost_monthly || userApp!.cost_monthly || ''} onChange={e => setEditingApp({ ...userApp, appName: infoApp.name, cost_monthly: e.target.value })} disabled={!isAdmin} />
                            </div>
                            <div className="space-y-2">
                              <Label>Annual Cost ($)</Label>
                              <Input type="number" value={editingApp?.cost_annual || userApp!.cost_annual || ''} onChange={e => setEditingApp({ ...userApp, appName: infoApp.name, cost_annual: e.target.value })} disabled={!isAdmin} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Renewal Date</Label>
                              <Input type="date" value={editingApp?.renewal_date || userApp!.renewal_date || ''} onChange={e => setEditingApp({ ...userApp, appName: infoApp.name, renewal_date: e.target.value })} disabled={!isAdmin} />
                            </div>
                            <div className="space-y-2">
                              <Label>Term (months)</Label>
                              <Input type="number" value={editingApp?.term_months || userApp!.term_months || ''} onChange={e => setEditingApp({ ...userApp, appName: infoApp.name, term_months: e.target.value })} disabled={!isAdmin} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>License Count</Label>
                              <Input type="number" value={editingApp?.license_count || userApp!.license_count || ''} onChange={e => setEditingApp({ ...userApp, appName: infoApp.name, license_count: e.target.value })} disabled={!isAdmin} />
                            </div>
                            <div className="space-y-2">
                              <Label>Billing Cycle</Label>
                              <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={editingApp?.billing_cycle || userApp!.billing_cycle || ''}
                                onChange={e => setEditingApp({ ...userApp, appName: infoApp.name, billing_cycle: e.target.value })}
                                disabled={!isAdmin}
                              >
                                <option value="">Select...</option>
                                <option value="monthly">Monthly</option>
                                <option value="annual">Annual</option>
                                <option value="multi-year">Multi-Year</option>
                                <option value="other">Other</option>
                              </select>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Notes</Label>
                            <textarea
                              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              value={editingApp?.notes || userApp!.notes || ''}
                              onChange={e => setEditingApp({ ...userApp, appName: infoApp.name, notes: e.target.value })}
                              disabled={!isAdmin}
                            />
                          </div>
                          {isAdmin && <Button className="w-full" onClick={handleSaveDetails}>Save Details</Button>}
                        </div>

                        {/* Contacts */}
                        <ContactsSection userApplicationId={userApp!.id} isAdmin={isAdmin} />

                        {/* Contracts redirect */}
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Contracts</p>
                          <Button variant="outline" size="sm" className="gap-2 w-full" onClick={() => { setInfoApp(null); navigate('/budget'); }}>
                            <FolderOpen className="h-3.5 w-3.5" />
                            Manage Contracts in Budget & Spend
                          </Button>
                        </div>
                      </div>
                  </TabsContent>
                )}
              </Tabs>
            );
          })()}
        </DialogContent>
      </Dialog>


      <SearchToolDialog open={searchToolOpen} onOpenChange={setSearchToolOpen} />
    </div>
  );
}
