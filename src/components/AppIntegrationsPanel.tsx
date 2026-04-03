import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from 'lucide-react';
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
}

export default function AppIntegrationsPanel({ open, onClose, appName, appId, integrations }: AppIntegrationsPanelProps) {
  // Filter integrations where this app is either source or target
  const appIntegrations = integrations.filter(
    i => i.source?.id === appId || i.target?.id === appId
  );

  // Group by connected app
  const grouped = appIntegrations.map(i => {
    const otherApp = i.source?.id === appId ? i.target : i.source;
    return { ...i, otherApp };
  });

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
          <ScrollArea className="flex-1 -mx-6 px-6" style={{ maxHeight: '60vh' }}>
            <div className="space-y-3 pb-2">
              {grouped.map(integ => (
                <div key={integ.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{integ.otherApp?.name || 'Unknown'}</span>
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
                    <a
                      href={integ.documentation_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
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
      </DialogContent>
    </Dialog>
  );
}
