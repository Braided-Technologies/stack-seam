import { useMemo, useCallback, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  MarkerType,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useUserApplications, useIntegrations, useDiscoverIntegrations } from '@/hooks/useStackData';
import { CATEGORY_COLORS } from '@/lib/constants';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { ExternalLink, Sparkles, RefreshCw } from 'lucide-react';

export default function StackMap() {
  const { data: userApps = [] } = useUserApplications();
  const { data: allIntegrations = [] } = useIntegrations();
  const discoverIntegrations = useDiscoverIntegrations();
  const [selectedEdge, setSelectedEdge] = useState<any>(null);

  const userAppIdList = useMemo(() => userApps.map(ua => ua.application_id), [userApps]);

  const relevantIntegrations = useMemo(() => {
    const ids = new Set(userAppIdList);
    return allIntegrations.filter(i => ids.has(i.source_app_id) && ids.has(i.target_app_id));
  }, [allIntegrations, userAppIdList]);

  const { initialNodes, initialEdges } = useMemo(() => {
    const byCategory = new Map<string, typeof userApps>();
    userApps.forEach(ua => {
      const catName = (ua as any).applications?.categories?.name || 'Other';
      if (!byCategory.has(catName)) byCategory.set(catName, []);
      byCategory.get(catName)!.push(ua);
    });

    const nodes: Node[] = [];
    let catIndex = 0;
    const cols = 3;

    byCategory.forEach((apps, catName) => {
      const col = catIndex % cols;
      const row = Math.floor(catIndex / cols);
      const color = CATEGORY_COLORS[catName] || 'hsl(221, 83%, 53%)';

      apps.forEach((ua, appIdx) => {
        nodes.push({
          id: ua.application_id,
          position: { x: col * 300 + (appIdx % 2) * 160, y: row * 250 + Math.floor(appIdx / 2) * 80 },
          data: { label: (ua as any).applications?.name || 'Unknown' },
          style: {
            background: color,
            color: '#fff',
            border: 'none',
            borderRadius: '12px',
            padding: '12px 20px',
            fontSize: '13px',
            fontWeight: 600,
            boxShadow: `0 4px 12px ${color}40`,
          },
        });
      });
      catIndex++;
    });

    const edges: Edge[] = relevantIntegrations.map(i => ({
      id: i.id,
      source: i.source_app_id,
      target: i.target_app_id,
      animated: true,
      style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--primary))' },
      data: i,
    }));

    return { initialNodes: nodes, initialEdges: edges };
  }, [userApps, relevantIntegrations]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useMemo(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onEdgeClick = useCallback((_: any, edge: Edge) => {
    setSelectedEdge(edge.data);
  }, []);

  const handleDiscover = async () => {
    const appNames = userApps.map(ua => (ua as any).applications?.name).filter(Boolean);
    if (appNames.length < 2) {
      toast({ title: 'Need at least 2 apps', description: 'Add more tools to your stack first.' });
      return;
    }
    try {
      const result = await discoverIntegrations.mutateAsync(appNames);
      toast({
        title: 'Integration discovery complete',
        description: `Found ${result.discovered} integrations, ${result.saved} new saved.`,
      });
    } catch (e: any) {
      toast({ title: 'Discovery failed', description: e.message, variant: 'destructive' });
    }
  };

  if (userApps.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">No apps in your stack yet</h2>
          <p className="text-muted-foreground">Go to My Stack to add applications, then come back to see the integration map.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full" style={{ height: 'calc(100vh)' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeClick={onEdgeClick}
        fitView
        fitViewOptions={{ padding: 0.3 }}
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={(node) => (node.style?.background as string) || '#666'}
          style={{ background: 'hsl(var(--card))' }}
        />
        <Panel position="top-left" className="bg-card/90 backdrop-blur rounded-lg border p-3 shadow-sm space-y-2">
          <p className="text-sm font-medium">{nodes.length} apps · {edges.length} integrations</p>
          <p className="text-xs text-muted-foreground">Click a connection line to see details</p>
          <Button
            size="sm"
            onClick={handleDiscover}
            disabled={discoverIntegrations.isPending}
            className="w-full gap-2"
          >
            {discoverIntegrations.isPending ? (
              <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Discovering...</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5" /> Discover Integrations</>
            )}
          </Button>
        </Panel>
      </ReactFlow>

      <Dialog open={!!selectedEdge} onOpenChange={open => !open && setSelectedEdge(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Integration Details</DialogTitle>
            <DialogDescription>
              {selectedEdge?.source?.name} ↔ {selectedEdge?.target?.name}
            </DialogDescription>
          </DialogHeader>
          {selectedEdge && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-1">Description</p>
                <p className="text-sm text-muted-foreground">{selectedEdge.description || 'No description available'}</p>
              </div>
              <div>
                <p className="text-sm font-medium mb-1">Type</p>
                <Badge variant="secondary">{selectedEdge.integration_type || 'Unknown'}</Badge>
              </div>
              {selectedEdge.data_shared && (
                <div>
                  <p className="text-sm font-medium mb-1">Data Shared</p>
                  <p className="text-sm text-muted-foreground">{selectedEdge.data_shared}</p>
                </div>
              )}
              {selectedEdge.documentation_url && (
                <a
                  href={selectedEdge.documentation_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  View Documentation
                </a>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
