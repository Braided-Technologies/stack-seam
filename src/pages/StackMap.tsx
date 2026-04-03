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
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import { ExternalLink, Sparkles, RefreshCw, LayoutGrid, Eye } from 'lucide-react';
import AppIntegrationsPanel from '@/components/AppIntegrationsPanel';

export default function StackMap() {
  const { data: userApps = [] } = useUserApplications();
  const { data: allIntegrations = [] } = useIntegrations();
  const discoverIntegrations = useDiscoverIntegrations();
  const [selectedEdge, setSelectedEdge] = useState<any>(null);
  const [selectedApp, setSelectedApp] = useState<{ id: string; name: string } | null>(null);
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());
  const [legendOpen, setLegendOpen] = useState(true);
  const [groupLayout, setGroupLayout] = useState(false);

  const userAppIdList = useMemo(() => userApps.map(ua => ua.application_id), [userApps]);

  const relevantIntegrations = useMemo(() => {
    const ids = new Set(userAppIdList);
    return allIntegrations.filter(i => ids.has(i.source_app_id) && ids.has(i.target_app_id));
  }, [allIntegrations, userAppIdList]);

  // Build category map for apps
  const appCategoryMap = useMemo(() => {
    const map = new Map<string, string>();
    userApps.forEach(ua => {
      const catName = (ua as any).applications?.categories?.name || 'Other';
      map.set(ua.application_id, catName);
    });
    return map;
  }, [userApps]);

  // Unique categories present in the user's stack
  const presentCategories = useMemo(() => {
    const cats = new Set<string>();
    appCategoryMap.forEach(cat => cats.add(cat));
    return Array.from(cats).sort();
  }, [appCategoryMap]);

  const toggleCategory = (cat: string) => {
    setHiddenCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const { computedNodes, computedEdges } = useMemo(() => {
    // Filter visible apps
    const visibleApps = userApps.filter(ua => {
      const cat = appCategoryMap.get(ua.application_id) || 'Other';
      return !hiddenCategories.has(cat);
    });
    const visibleIds = new Set(visibleApps.map(ua => ua.application_id));

    // Group by category
    const byCategory = new Map<string, typeof userApps>();
    visibleApps.forEach(ua => {
      const catName = appCategoryMap.get(ua.application_id) || 'Other';
      if (!byCategory.has(catName)) byCategory.set(catName, []);
      byCategory.get(catName)!.push(ua);
    });

    const visibleIntegrations = relevantIntegrations.filter(
      i => visibleIds.has(i.source_app_id) && visibleIds.has(i.target_app_id)
    );

    const nodes: Node[] = [];
    const categoryEntries = Array.from(byCategory.entries());

    if (groupLayout) {
      // Grouped sector layout - arrange categories in a circle
      const categoryCount = categoryEntries.length;
      const baseRadius = Math.max(350, categoryCount * 60);

      categoryEntries.forEach(([catName, apps], catIdx) => {
        const angle = (catIdx / categoryCount) * 2 * Math.PI - Math.PI / 2;
        const centerX = Math.cos(angle) * baseRadius;
        const centerY = Math.sin(angle) * baseRadius;
        const color = CATEGORY_COLORS[catName] || 'hsl(221, 83%, 53%)';

        // Category label node
        nodes.push({
          id: `label-${catName}`,
          position: { x: centerX - 60, y: centerY - 40 },
          data: { label: catName },
          selectable: false,
          draggable: false,
          style: {
            background: 'transparent',
            border: 'none',
            fontSize: '11px',
            fontWeight: 700,
            color: color,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
            pointerEvents: 'none' as const,
            width: 'auto',
            padding: '0',
          },
        });

        // Arrange apps in a small grid within the sector
        const gridCols = Math.ceil(Math.sqrt(apps.length));
        apps.forEach((ua, appIdx) => {
          const appName = (ua as any).applications?.name || 'Unknown';
          const integCount = visibleIntegrations.filter(
            i => i.source_app_id === ua.application_id || i.target_app_id === ua.application_id
          ).length;

          const col = appIdx % gridCols;
          const row = Math.floor(appIdx / gridCols);

          nodes.push({
            id: ua.application_id,
            position: { x: centerX + col * 160, y: centerY + row * 70 },
            data: { label: integCount > 0 ? `${appName} (${integCount})` : appName, appName },
            style: {
              background: color,
              color: '#fff',
              border: 'none',
              borderRadius: '12px',
              padding: '12px 20px',
              fontSize: '13px',
              fontWeight: 600,
              boxShadow: `0 4px 12px ${color}40`,
              cursor: 'pointer',
            },
          });
        });
      });
    } else {
      // Default layout
      const cols = 3;
      let catIndex = 0;

      categoryEntries.forEach(([catName, apps]) => {
        const col = catIndex % cols;
        const row = Math.floor(catIndex / cols);
        const color = CATEGORY_COLORS[catName] || 'hsl(221, 83%, 53%)';

        apps.forEach((ua, appIdx) => {
          const appName = (ua as any).applications?.name || 'Unknown';
          const integCount = visibleIntegrations.filter(
            i => i.source_app_id === ua.application_id || i.target_app_id === ua.application_id
          ).length;

          nodes.push({
            id: ua.application_id,
            position: { x: col * 300 + (appIdx % 2) * 160, y: row * 250 + Math.floor(appIdx / 2) * 80 },
            data: { label: integCount > 0 ? `${appName} (${integCount})` : appName, appName },
            style: {
              background: color,
              color: '#fff',
              border: 'none',
              borderRadius: '12px',
              padding: '12px 20px',
              fontSize: '13px',
              fontWeight: 600,
              boxShadow: `0 4px 12px ${color}40`,
              cursor: 'pointer',
            },
          });
        });
        catIndex++;
      });
    }

    const edges: Edge[] = visibleIntegrations.map(i => ({
      id: i.id,
      source: i.source_app_id,
      target: i.target_app_id,
      animated: true,
      style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--primary))' },
      data: i,
    }));

    return { computedNodes: nodes, computedEdges: edges };
  }, [userApps, relevantIntegrations, hiddenCategories, groupLayout, appCategoryMap]);

  const [nodes, setNodes, onNodesChange] = useNodesState(computedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(computedEdges);

  useMemo(() => {
    setNodes(computedNodes);
    setEdges(computedEdges);
  }, [computedNodes, computedEdges, setNodes, setEdges]);

  const onEdgeClick = useCallback((_: any, edge: Edge) => {
    setSelectedEdge(edge.data);
  }, []);

  const onNodeClick = useCallback((_: any, node: Node) => {
    if (node.id.startsWith('label-')) return;
    setSelectedApp({ id: node.id, name: (node.data as any).appName || (node.data as any).label });
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

  const visibleNodeCount = nodes.filter(n => !n.id.startsWith('label-')).length;

  return (
    <div className="h-full w-full" style={{ height: 'calc(100vh)' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeClick={onEdgeClick}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.3 }}
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={(node) => (node.style?.background as string) || '#666'}
          style={{ background: 'hsl(var(--card))' }}
        />

        {/* Info + actions panel */}
        <Panel position="top-left" className="bg-card/90 backdrop-blur rounded-lg border p-3 shadow-sm space-y-2">
          <p className="text-sm font-medium">{visibleNodeCount} apps · {edges.length} integrations</p>
          <p className="text-xs text-muted-foreground">Click an app to see all its integrations</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleDiscover}
              disabled={discoverIntegrations.isPending}
              className="flex-1 gap-2"
            >
              {discoverIntegrations.isPending ? (
                <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Discovering...</>
              ) : (
                <><Sparkles className="h-3.5 w-3.5" /> Discover</>
              )}
            </Button>
            <Button
              size="sm"
              variant={groupLayout ? 'default' : 'outline'}
              onClick={() => setGroupLayout(!groupLayout)}
              className="gap-1"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Group
            </Button>
          </div>
        </Panel>

        {/* Category legend panel */}
        <Panel position="top-right" className="bg-card/90 backdrop-blur rounded-lg border shadow-sm">
          <button
            onClick={() => setLegendOpen(!legendOpen)}
            className="flex items-center gap-2 px-3 py-2 w-full text-left text-sm font-medium"
          >
            <Eye className="h-3.5 w-3.5" />
            Categories
            <span className="ml-auto text-xs text-muted-foreground">{hiddenCategories.size > 0 ? `${hiddenCategories.size} hidden` : ''}</span>
          </button>
          {legendOpen && (
            <ScrollArea className="max-h-64 px-3 pb-3">
              <div className="space-y-1.5">
                {presentCategories.map(cat => {
                  const color = CATEGORY_COLORS[cat] || 'hsl(221, 83%, 53%)';
                  const hidden = hiddenCategories.has(cat);
                  return (
                    <label
                      key={cat}
                      className="flex items-center gap-2 cursor-pointer text-xs py-0.5"
                    >
                      <Checkbox
                        checked={!hidden}
                        onCheckedChange={() => toggleCategory(cat)}
                        className="h-3.5 w-3.5"
                      />
                      <span
                        className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={{ background: color }}
                      />
                      <span className={hidden ? 'text-muted-foreground line-through' : ''}>{cat}</span>
                    </label>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </Panel>
      </ReactFlow>

      {/* Edge detail dialog */}
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

      {/* App integrations panel */}
      <AppIntegrationsPanel
        open={!!selectedApp}
        onClose={() => setSelectedApp(null)}
        appName={selectedApp?.name || ''}
        appId={selectedApp?.id || ''}
        integrations={allIntegrations as any}
      />
    </div>
  );
}
