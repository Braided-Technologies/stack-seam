import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, ArrowRight } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Integration {
  id: string;
  description: string | null;
  integration_type: string | null;
  data_shared: string | null;
  documentation_url: string | null;
  source: { id: string; name: string; categories: { name: string } | null } | null;
  target: { id: string; name: string; categories: { name: string } | null } | null;
}

interface AppIntegrationsPanelProps {
  open: boolean;
  onClose: () => void;
  appName: string;
  appId: string;
  integrations: Integration[];
  userAppIds?: string[];
}

export default function AppIntegrationsPanel({ open, onClose, appName, appId, integrations, userAppIds }: AppIntegrationsPanelProps) {
  const navigate = useNavigate();

  const appIntegrations = integrations.filter(i => {
    const matches = i.source?.id === appId || i.target?.id === appId;
    if (!matches) return false;
    // If userAppIds provided, only show integrations where both apps are in stack
    if (userAppIds) {
      return userAppIds.includes(i.source?.id || '') && userAppIds.includes(i.target?.id || '');
    }
    return true;
  });

  const grouped = appIntegrations.map(i => {
    const otherApp = i.source?.id === appId ? i.target : i.source;
    return { ...i, otherApp };
  });

  const handleIntegrationClick = (integrationId: string) => {
    onClose();
    navigate(`/integrations?highlight=${integrationId}`);
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{appName} — Integrations</DialogTitle>
          <DialogDescription>
            {grouped.length} integration{grouped.length !== 1 ? 's' : ''} found
          </DialogDescription>
        </DialogHeader>

        {grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No integrations discovered yet. Run "Discover Integrations" to find connections.
          </p>
        ) : (
          <ScrollArea className="flex-1 -mx-6 px-6 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 120px)' }}>
            <div className="space-y-3 pb-2">
              {grouped.map(integ => (
                <div
                  key={integ.id}
                  className="rounded-lg border p-3 space-y-2 cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => handleIntegrationClick(integ.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{integ.otherApp?.name || 'Unknown'}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {integ.integration_type || 'unknown'}
                    </Badge>
                  </div>
                  {integ.description && (
                    <p className="text-xs text-muted-foreground">{integ.description}</p>
                  )}
                  {integ.data_shared && (
                    <div className="flex flex-wrap gap-1">
                      {integ.data_shared.split(',').map((d, i) => (
                        <Badge key={i} variant="secondary" className="text-xs font-normal">
                          {d.trim()}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {integ.documentation_url && (
                    <div className="flex items-center gap-2">
                      <a
                        href={integ.documentation_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                        onClick={e => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3 w-3" />
                        Documentation
                      </a>
                      {(integ as any).link_status === 'verified'
                        ? <span className="text-[10px] text-green-600 dark:text-green-400">✓ Verified</span>
                        : <span className="text-[10px] text-muted-foreground italic">⚠ Unverified link</span>
                      }
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <div className="pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={() => { onClose(); navigate('/integrations'); }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View all in Integrations tab
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
