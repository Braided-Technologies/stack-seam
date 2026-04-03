import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { useSearchTool, useAddUserApplication, useCategories, useUpdateUserApplication } from '@/hooks/useStackData';
import { Search, Plus, Loader2, Check, ExternalLink } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';

interface SearchToolDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SearchToolDialog({ open, onOpenChange }: SearchToolDialogProps) {
  const [query, setQuery] = useState('');
  const searchTool = useSearchTool();
  const addApp = useAddUserApplication();
  const { data: categories = [] } = useCategories();
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, string>>({});

  const handleSearch = async () => {
    if (query.trim().length < 2) return;
    searchTool.mutate(query.trim());
  };

  const handleAddToStack = async (appId: string) => {
    try {
      await addApp.mutateAsync(appId);
      setAddedIds(prev => new Set(prev).add(appId));
      toast({ title: 'Added to stack' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleCategoryChange = async (appId: string, categoryId: string) => {
    setCategoryOverrides(prev => ({ ...prev, [appId]: categoryId }));
    // Update in DB via edge function (service role needed since apps table is read-only)
    try {
      const { error } = await supabase.functions.invoke('search-tool', {
        body: { updateCategory: true, appId, categoryId },
      });
      if (error) throw error;
      const catName = categories.find(c => c.id === categoryId)?.name;
      toast({ title: `Category updated to ${catName}` });
    } catch (e: any) {
      toast({ title: 'Error updating category', description: e.message, variant: 'destructive' });
    }
  };

  const result = searchTool.data;

  const renderAppCard = (app: any) => {
    const currentCategoryId = categoryOverrides[app.id] || app.category_id;
    const currentCategoryName = categories.find(c => c.id === currentCategoryId)?.name || app.categories?.name;

    return (
      <div key={app.id} className="rounded-lg border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm">{app.name}</p>
              {app.vendor_url && (
                <a href={app.vendor_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            {app.description && <p className="text-xs text-muted-foreground">{app.description}</p>}
          </div>
          <Button
            size="sm"
            variant={addedIds.has(app.id) ? "secondary" : "default"}
            disabled={addedIds.has(app.id) || addApp.isPending}
            onClick={() => handleAddToStack(app.id)}
          >
            {addedIds.has(app.id) ? <><Check className="h-3 w-3 mr-1" /> Added</> : <><Plus className="h-3 w-3 mr-1" /> Add to Stack</>}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Category:</span>
          <Select value={currentCategoryId || ''} onValueChange={(v) => handleCategoryChange(app.id, v)}>
            <SelectTrigger className="h-7 text-xs w-auto min-w-[140px]">
              <SelectValue placeholder={currentCategoryName || 'Select...'} />
            </SelectTrigger>
            <SelectContent>
              {categories.map(cat => (
                <SelectItem key={cat.id} value={cat.id} className="text-xs">{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={o => { onOpenChange(o); if (!o) { setQuery(''); searchTool.reset(); setAddedIds(new Set()); setCategoryOverrides({}); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Search for a Tool</DialogTitle>
          <DialogDescription>
            Can't find a tool? Search by name or URL and we'll look it up for you.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            placeholder="e.g. Drata, Vanta, or a vendor URL..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <Button onClick={handleSearch} disabled={searchTool.isPending || query.trim().length < 2}>
            {searchTool.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>

        {searchTool.isError && (
          <p className="text-sm text-destructive">
            {(searchTool.error as any)?.message || 'Something went wrong. Try again.'}
          </p>
        )}

        {result && !result.found && (
          <p className="text-sm text-muted-foreground">
            Could not identify this tool. Try a different name or URL.
          </p>
        )}

        {result?.found && result.existing && result.applications?.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Already in the catalog:</p>
            {result.applications.map((app: any) => renderAppCard(app))}
          </div>
        )}

        {result?.found && !result.existing && result.application && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Found and added to the catalog:</p>
            {renderAppCard(result.application)}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
