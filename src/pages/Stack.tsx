import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCategories, useApplications, useUserApplications, useAddUserApplication, useRemoveUserApplication, useUpdateUserApplication, useIntegrations } from '@/hooks/useStackData';
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
import { Plus, Check, X, ChevronDown, ChevronUp, Settings, Search, Filter, Download, Layers, DollarSign, FolderOpen, ExternalLink, Map as MapIcon, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ContactsSection from '@/components/ContactsSection';
import ContractsSection from '@/components/ContractsSection';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type FilterMode = 'all' | 'selected' | 'available';

export default function Stack() {
  const { data: categories = [] } = useCategories();
  const { data: applications = [] } = useApplications();
  const { data: userApps = [] } = useUserApplications();
  const { data: allIntegrations = [] } = useIntegrations();
  const addApp = useAddUserApplication();
  const removeApp = useRemoveUserApplication();
  const updateApp = useUpdateUserApplication();
  const { userRole } = useAuth();
  const isAdmin = userRole === 'admin';
  const navigate = useNavigate();

  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [editingApp, setEditingApp] = useState<any>(null);
  const [infoApp, setInfoApp] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [searchToolOpen, setSearchToolOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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
    setInfoApp({
      id: app.id,
      name: app.name,
      description: app.description,
      vendor_url: app.vendor_url,
      category: cat?.name || 'Uncategorized',
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
      <div key={cat.id} className="rounded-xl border bg-card/50 overflow-hidden" style={{ borderLeftWidth: '3px', borderLeftColor: color }}>
        <button
          className="flex w-full items-center justify-between p-3 text-left hover:bg-accent/30 transition-colors"
          onClick={() => setExpandedCategory(isExpanded ? null : cat.id)}
        >
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            <span className="font-semibold text-sm">{cat.name}</span>
            {selectedInCat.length > 0 && (
              <Badge variant="secondary" className="text-xs">{selectedInCat.length}</Badge>
            )}
          </div>
          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {isExpanded && (
          <div className="border-t px-3 pt-3 pb-3">
            <div className="grid gap-1.5">
              {filteredApps.map(app => {
                const userApp = userAppMap.get(app.id);
                const isSelected = !!userApp;
                return (
                  <div
                    key={app.id}
                    className={`flex items-center justify-between rounded-md border p-2 transition-colors cursor-pointer hover:bg-accent/20 ${isSelected ? 'border-primary/30 bg-primary/5' : 'bg-background/50'}`}
                    onClick={() => handleAppClick(app)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{app.name}</p>
                      {app.description && (
                        <p className="text-xs text-muted-foreground truncate">{app.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-2" onClick={e => e.stopPropagation()}>
                      {isSelected && (
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingApp({ ...userApp, appName: app.name })}>
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
                      {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Stack</h1>
          <p className="text-muted-foreground text-sm">Select the tools in your IT stack by category</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setSearchToolOpen(true)}>
              <Search className="h-4 w-4 mr-2" />
              Find a Tool
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={userApps.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary bar */}
      {userApps.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Layers className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary.totalApps}</p>
              <p className="text-xs text-muted-foreground">Total Apps</p>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">${summary.totalMonthly.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Monthly Spend</p>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">${summary.totalAnnual.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Annual Spend</p>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
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

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search apps across all categories..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterMode} onValueChange={(v: FilterMode) => setFilterMode(v)}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <Filter className="h-4 w-4 mr-2" />
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
      <div className="grid gap-6 lg:grid-cols-2">
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
                className="flex items-center gap-2 w-full text-left px-1 group"
                onClick={() => toggleGroup(group.label)}
              >
                <div className="flex items-center gap-2 flex-1">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </h2>
                  <Badge variant="outline" className="text-xs font-normal">
                    {selectedCount} selected
                  </Badge>
                </div>
                {collapsedGroups.has(group.label)
                  ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  : <ChevronUp className="h-3 w-3 text-muted-foreground" />
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
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
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
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {infoApp?.name}
              {infoApp && userAppIds.has(infoApp.id) && <Check className="h-4 w-4 text-primary" />}
            </DialogTitle>
            <DialogDescription>{infoApp?.category}</DialogDescription>
          </DialogHeader>
          {infoApp && (
            <Tabs defaultValue="overview">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="integrations">
                  Integrations ({infoAppIntegrations.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4 pt-2">
                {infoApp.description && (
                  <p className="text-sm text-muted-foreground">{infoApp.description}</p>
                )}
                {!infoApp.description && (
                  <p className="text-sm text-muted-foreground italic">No description available.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{infoApp.category}</Badge>
                  {userAppIds.has(infoApp.id) && <Badge variant="default">In Your Stack</Badge>}
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
                  {isAdmin && !userAppIds.has(infoApp.id) && (
                    <Button size="sm" className="gap-1" onClick={() => { handleAdd(infoApp.id); setInfoApp(null); }}>
                      <Plus className="h-3.5 w-3.5" />
                      Add to Stack
                    </Button>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="integrations" className="pt-2">
                {infoAppIntegrations.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">
                    No integrations discovered yet. Run "Discover Integrations" on the Stack Map to find connections.
                  </p>
                ) : (
                  <ScrollArea className="max-h-[50vh]">
                    <div className="space-y-2 pr-2">
                      {infoAppIntegrations.map((integ: any) => (
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
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* App detail/edit dialog */}
      <Dialog open={!!editingApp} onOpenChange={open => !open && setEditingApp(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingApp?.appName || 'Application Details'}</DialogTitle>
            <DialogDescription>Manage details, contacts, and contracts</DialogDescription>
          </DialogHeader>
          {editingApp && (
            <Tabs defaultValue="details">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="contacts">Contacts</TabsTrigger>
                <TabsTrigger value="contracts">Contracts</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Monthly Cost ($)</Label>
                    <Input type="number" value={editingApp.cost_monthly || ''} onChange={e => setEditingApp({ ...editingApp, cost_monthly: e.target.value })} disabled={!isAdmin} />
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
                    <Label>Term (months)</Label>
                    <Input type="number" value={editingApp.term_months || ''} onChange={e => setEditingApp({ ...editingApp, term_months: e.target.value })} disabled={!isAdmin} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>License Count</Label>
                    <Input type="number" value={editingApp.license_count || ''} onChange={e => setEditingApp({ ...editingApp, license_count: e.target.value })} disabled={!isAdmin} />
                  </div>
                  <div className="space-y-2">
                    <Label>Billing Cycle</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={editingApp.billing_cycle || ''}
                      onChange={e => setEditingApp({ ...editingApp, billing_cycle: e.target.value })}
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
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={editingApp.notes || ''}
                    onChange={e => setEditingApp({ ...editingApp, notes: e.target.value })}
                    disabled={!isAdmin}
                  />
                </div>
                {isAdmin && <Button className="w-full" onClick={handleSaveDetails}>Save Details</Button>}
              </TabsContent>

              <TabsContent value="contacts" className="pt-2">
                <ContactsSection userApplicationId={editingApp.id} isAdmin={isAdmin} />
              </TabsContent>

              <TabsContent value="contracts" className="pt-2">
                <ContractsSection userApplicationId={editingApp.id} isAdmin={isAdmin} />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      <SearchToolDialog open={searchToolOpen} onOpenChange={setSearchToolOpen} />
    </div>
  );
}
