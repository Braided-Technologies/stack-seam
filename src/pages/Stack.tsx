import { useState } from 'react';
import { useCategories, useApplications, useUserApplications, useAddUserApplication, useRemoveUserApplication, useUpdateUserApplication } from '@/hooks/useStackData';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { CATEGORY_COLORS } from '@/lib/constants';
import { Plus, Check, X, ChevronDown, ChevronUp, Settings, Search, Filter, Download } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ContactsSection from '@/components/ContactsSection';
import ContractsSection from '@/components/ContractsSection';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type FilterMode = 'all' | 'selected' | 'available';

export default function Stack() {
  const { data: categories = [] } = useCategories();
  const { data: applications = [] } = useApplications();
  const { data: userApps = [] } = useUserApplications();
  const addApp = useAddUserApplication();
  const removeApp = useRemoveUserApplication();
  const updateApp = useUpdateUserApplication();
  const { userRole } = useAuth();
  const isAdmin = userRole === 'admin';

  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [editingApp, setEditingApp] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  const userAppMap = new Map(userApps.map(ua => [ua.application_id, ua]));

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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Stack</h1>
          <p className="text-muted-foreground">Select the tools in your IT stack by category</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={userApps.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

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
      </div>

      <div className="grid gap-3">
        {categories.map(cat => {
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
            <Card key={cat.id} className="overflow-hidden">
              <button
                className="flex w-full items-center justify-between p-4 text-left hover:bg-accent/50 transition-colors"
                onClick={() => setExpandedCategory(isExpanded ? null : cat.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                  <span className="font-semibold">{cat.name}</span>
                  {selectedInCat.length > 0 && (
                    <Badge variant="secondary">{selectedInCat.length} selected</Badge>
                  )}
                </div>
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {isExpanded && (
                <CardContent className="border-t pt-4">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredApps.map(app => {
                      const userApp = userAppMap.get(app.id);
                      const isSelected = !!userApp;
                      return (
                        <div
                          key={app.id}
                          className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${isSelected ? 'border-primary bg-primary/5' : ''}`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{app.name}</p>
                            {app.description && (
                              <p className="text-xs text-muted-foreground truncate">{app.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            {isSelected && (
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingApp({ ...userApp, appName: app.name })}>
                                <Settings className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {isAdmin && (
                              isSelected ? (
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleRemove(userApp!.id)}>
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              ) : (
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleAdd(app.id)}>
                                  <Plus className="h-3.5 w-3.5" />
                                </Button>
                              )
                            )}
                            {isSelected && <Check className="h-4 w-4 text-primary" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* App detail dialog with tabs */}
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
    </div>
  );
}
