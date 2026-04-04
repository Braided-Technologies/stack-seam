import { useMemo, useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { CATEGORY_GROUPS } from '@/lib/categoryGroups';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from '@/hooks/use-toast';
import { ExternalLink, Sparkles, RefreshCw, LayoutGrid, Eye, ChevronDown, ChevronRight } from 'lucide-react';
import AppIntegrationsPanel from '@/components/AppIntegrationsPanel';

// Map each category to its group
const categoryToGroup = new Map<string, string>();
CATEGORY_GROUPS.forEach(g => g.categories.forEach(c => categoryToGroup.set(c, g.label)));

// Group layout positions for a 3x2 grid
const GROUP_POSITIONS: Record<string, { col: number; row: number }> = {
  'Core Operations': { col: 0, row: 0 },
  'Security': { col: 1, row: 0 },
  'Business & Finance': { col: 2, row: 0 },
  'Infrastructure': { col: 0, row: 1 },
  'Productivity & Communication': { col: 1, row: 1 },
  'Strategy': { col: 2, row: 1 },
};

const SECTOR_WIDTH = 550;
const SECTOR_HEIGHT = 400;
const SECTOR_GAP_X = 80;
const SECTOR_GAP_Y = 80;
const SECTOR_PADDING = 60;

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

  const appCategoryMap = useMemo(() => {
    const map = new Map<string, string>();
    userApps.forEach(ua => {
      const catName = (ua as any).applications?.categories?.name || 'Other';
      map.set(ua.application_id, catName);
    });
    return map;
  }, [userApps]);

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
    const visibleApps = userApps.filter(ua => {
      const cat = appCategoryMap.get(ua.application_id) || 'Other';
      return !hiddenCategories.has(cat);
    });
    const visibleIds = new Set(visibleApps.map(ua => ua.application_id));

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
      // Named quadrant/sector layout using CATEGORY_GROUPS
      const byGroup = new Map<string, { catName: string; apps: typeof userApps }[]>();
      categoryEntries.forEach(([catName, apps]) => {
        const groupName = categoryToGroup.get(catName) || 'Other';
        if (!byGroup.has(groupName)) byGroup.set(groupName, []);
        byGroup.get(groupName)!.push({ catName, apps });
      });

      byGroup.forEach((catEntries, groupName) => {
        const pos = GROUP_POSITIONS[groupName] || { col: 2, row: 1 };
        const sectorX = pos.col * (SECTOR_WIDTH + SECTOR_GAP_X);
        const sectorY = pos.row * (SECTOR_HEIGHT + SECTOR_GAP_Y);

        // Background zone node
        const totalAppsInGroup = catEntries.reduce((s, e) => s + e.apps.length, 0);
        const dynamicHeight = Math.max(SECTOR_HEIGHT, SECTOR_PADDING + 40 + Math.ceil(totalAppsInGroup / 3) * 70 + 20);

        nodes.push({
          id: `zone-${groupName}`,
          position: { x: sectorX, y: sectorY },
          data: { label: '' },
          selectable: false,
          draggable: false,
          style: {
            width: `${SECTOR_WIDTH}px`,
            height: `${dynamicHeight}px`,
            background: 'hsl(var(--muted) / 0.3)',
            border: '1px dashed hsl(var(--border))',
            borderRadius: '16px',
            pointerEvents: 'none' as const,
            zIndex: -1,
          },
        });

        // Group label
        nodes.push({
          id: `label-zone-${groupName}`,
          position: { x: sectorX + 16, y: sectorY + 12 },
          data: { label: groupName },
          selectable: false,
          draggable: false,
          style: {
            background: 'transparent',
            border: 'none',
            fontSize: '13px',
            fontWeight: 700,
            color: 'hsl(var(--foreground))',
            textTransform: 'uppercase' as const,
            letterSpacing: '0.06em',
            pointerEvents: 'none' as const,
            width: 'auto',
            padding: '0',
          },
        });

        // Position apps within the sector in a grid
        let appIndex = 0;
        const gridCols = 3;
        catEntries.forEach(({ catName, apps }) => {
          const color = CATEGORY_COLORS[catName] || 'hsl(221, 83%, 53%)';
          apps.forEach(ua => {
            const appName = (ua as any).applications?.name || 'Unknown';
            const integCount = visibleIntegrations.filter(
              i => i.source_app_id === ua.application_id || i.target_app_id === ua.application_id
            ).length;

            const col = appIndex % gridCols;
            const row = Math.floor(appIndex / gridCols);

            nodes.push({
              id: ua.application_id,
              position: {
                x: sectorX + SECTOR_PADDING / 2 + col * 170,
                y: sectorY + SECTOR_PADDING + 20 + row * 65,
              },
              data: { label: integCount > 0 ? `${appName} (${integCount})` : appName, appName },
              style: {
                background: color,
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                padding: '10px 16px',
                fontSize: '12px',
                fontWeight: 600,
                boxShadow: `0 4px 12px ${color}40`,
                cursor: 'pointer',
                maxWidth: '155px',
              },
            });
            appIndex++;
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
      animated: false,
      style: { stroke: 'hsl(var(--primary))', strokeWidth: 1.5, opacity: 0.6 },
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
    if (node.id.startsWith('label-') || node.id.startsWith('zone-')) return;
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

  const visibleNodeCount = nodes.filter(n => !n.id.startsWith('label-') && !n.id.startsWith('zone-')).length;

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
        fitViewOptions={{ padding: 0.2 }}
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={(node) => (node.style?.background as string) || '#666'}
          style={{ background: 'hsl(var(--card))' }}
        />

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
              title={groupLayout ? 'Switch to default layout' : 'Group by business area'}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              {groupLayout ? 'Zones' : 'Group'}
            </Button>
            <Link to="/integrations">
              <Button size="sm" variant="outline" className="gap-1">
                <ExternalLink className="h-3.5 w-3.5" />
                All
              </Button>
            </Link>
          </div>
        </Panel>

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
            <div className="px-3 pb-3">
              <div className="flex gap-2 mb-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs px-2"
                  onClick={() => setHiddenCategories(new Set())}
                >
                  Select All
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs px-2"
                  onClick={() => setHiddenCategories(new Set(presentCategories))}
                >
                  Deselect All
                </Button>
              </div>
              <ScrollArea className="max-h-52">
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
            </div>
          )}
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
