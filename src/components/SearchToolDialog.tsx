import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { useSearchTool, useAddUserApplication } from '@/hooks/useStackData';
import { Search, Plus, Loader2, Check, ExternalLink } from 'lucide-react';

interface SearchToolDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SearchToolDialog({ open, onOpenChange }: SearchToolDialogProps) {
  const [query, setQuery] = useState('');
  const searchTool = useSearchTool();
  const addApp = useAddUserApplication();
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

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

  const result = searchTool.data;

  return (
    <Dialog open={open} onOpenChange={open => { onOpenChange(open); if (!open) { setQuery(''); searchTool.reset(); setAddedIds(new Set()); } }}>
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
            {result.applications.map((app: any) => (
              <div key={app.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{app.name}</p>
                  {app.description && <p className="text-xs text-muted-foreground truncate">{app.description}</p>}
                  {app.categories?.name && <Badge variant="outline" className="mt-1 text-xs">{app.categories.name}</Badge>}
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
            ))}
          </div>
        )}

        {result?.found && !result.existing && result.application && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Found and added to the catalog:</p>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{result.application.name}</p>
                  {result.application.vendor_url && (
                    <a href={result.application.vendor_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                {result.application.description && <p className="text-xs text-muted-foreground">{result.application.description}</p>}
                {result.application.categories?.name && <Badge variant="outline" className="mt-1 text-xs">{result.application.categories.name}</Badge>}
              </div>
              <Button
                size="sm"
                variant={addedIds.has(result.application.id) ? "secondary" : "default"}
                disabled={addedIds.has(result.application.id) || addApp.isPending}
                onClick={() => handleAddToStack(result.application.id)}
              >
                {addedIds.has(result.application.id) ? <><Check className="h-3 w-3 mr-1" /> Added</> : <><Plus className="h-3 w-3 mr-1" /> Add to Stack</>}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
