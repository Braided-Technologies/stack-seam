import { useState } from 'react';
import { useCategories, useApplications, useUserApplications, useAddUserApplication, useRemoveUserApplication, useUpdateUserApplication } from '@/hooks/useStackData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { CATEGORY_COLORS } from '@/lib/constants';
import { Plus, Check, X, ChevronDown, ChevronUp, Settings } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

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
      setEditingApp(null);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">My Stack</h1>
        <p className="text-muted-foreground">Select the tools in your IT stack by category</p>
      </div>

      <div className="grid gap-3">
        {categories.map(cat => {
          const catApps = applications.filter(a => a.category_id === cat.id);
          const selectedInCat = catApps.filter(a => userAppMap.has(a.id));
          const isExpanded = expandedCategory === cat.id;
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
                    {catApps.map(app => {
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
                            {isSelected && isAdmin && (
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingApp({ ...userApp })}>
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

      {/* Edit details dialog */}
      <Dialog open={!!editingApp} onOpenChange={open => !open && setEditingApp(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Application Details</DialogTitle>
            <DialogDescription>Update cost, renewal, and contract information</DialogDescription>
          </DialogHeader>
          {editingApp && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Monthly Cost ($)</Label>
                  <Input type="number" value={editingApp.cost_monthly || ''} onChange={e => setEditingApp({ ...editingApp, cost_monthly: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Annual Cost ($)</Label>
                  <Input type="number" value={editingApp.cost_annual || ''} onChange={e => setEditingApp({ ...editingApp, cost_annual: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Renewal Date</Label>
                  <Input type="date" value={editingApp.renewal_date || ''} onChange={e => setEditingApp({ ...editingApp, renewal_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Term (months)</Label>
                  <Input type="number" value={editingApp.term_months || ''} onChange={e => setEditingApp({ ...editingApp, term_months: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>License Count</Label>
                  <Input type="number" value={editingApp.license_count || ''} onChange={e => setEditingApp({ ...editingApp, license_count: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Billing Cycle</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={editingApp.billing_cycle || ''}
                    onChange={e => setEditingApp({ ...editingApp, billing_cycle: e.target.value })}
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
                />
              </div>
              <Button className="w-full" onClick={handleSaveDetails}>Save Details</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
