import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

type AppStatus = 'queued' | 'in_progress' | 'done' | 'error';
type AppResult = { saved?: number; error?: string };

interface DiscoveryState {
  isRunning: boolean;
  progress: Record<string, AppStatus>;
  results: Record<string, AppResult>;
  appNames: Record<string, string>; // appId -> appName for display
}

interface DiscoveryContextType {
  state: DiscoveryState;
  startBatchDiscovery: (userApps: { application_id: string; applications?: { name?: string } | null }[]) => void;
  dismiss: () => void;
  hasProgress: boolean;
}

const DiscoveryContext = createContext<DiscoveryContextType | null>(null);

export function useDiscovery() {
  const ctx = useContext(DiscoveryContext);
  if (!ctx) throw new Error('useDiscovery must be used within DiscoveryProvider');
  return ctx;
}

export function DiscoveryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DiscoveryState>({
    isRunning: false,
    progress: {},
    results: {},
    appNames: {},
  });
  const abortRef = useRef(false);
  const queryClient = useQueryClient();

  const startBatchDiscovery = useCallback((userApps: { application_id: string; applications?: { name?: string } | null }[]) => {
    if (state.isRunning) return;

    const stackNames = userApps
      .map(ua => ua.applications?.name)
      .filter(Boolean) as string[];

    if (stackNames.length < 2) {
      toast({ title: 'Need at least 2 apps', description: 'Add more apps to your stack first.', variant: 'destructive' });
      return;
    }

    const initialProgress: Record<string, AppStatus> = {};
    const appNames: Record<string, string> = {};
    userApps.forEach(ua => {
      if (ua.applications?.name) {
        initialProgress[ua.application_id] = 'queued';
        appNames[ua.application_id] = ua.applications.name;
      }
    });

    abortRef.current = false;
    setState({ isRunning: true, progress: initialProgress, results: {}, appNames });

    // Run in background - not tied to any component lifecycle
    (async () => {
      let totalSaved = 0;
      let totalDiscovered = 0;

      for (const ua of userApps) {
        if (abortRef.current) break;
        const appName = ua.applications?.name;
        if (!appName) continue;
        const appId = ua.application_id;

        setState(prev => ({
          ...prev,
          progress: { ...prev.progress, [appId]: 'in_progress' },
        }));

        try {
          const { data, error } = await supabase.functions.invoke('discover-integrations', {
            body: { app_names: stackNames, focus_app: appName },
          });
          if (error) throw error;

          totalSaved += data.saved || 0;
          totalDiscovered += data.discovered || 0;

          setState(prev => ({
            ...prev,
            progress: { ...prev.progress, [appId]: 'done' },
            results: { ...prev.results, [appId]: { saved: data.saved || 0 } },
          }));
        } catch (err: any) {
          console.error(`Discovery failed for ${appName}:`, err.message);
          setState(prev => ({
            ...prev,
            progress: { ...prev.progress, [appId]: 'error' },
            results: { ...prev.results, [appId]: { error: err.message } },
          }));
        }

        // Invalidate after each app so UI updates
        await queryClient.invalidateQueries({ queryKey: ['integrations'] });
      }

      setState(prev => ({ ...prev, isRunning: false }));
      toast({
        title: `Discovery complete: ${totalSaved} new integrations`,
        description: totalDiscovered > totalSaved
          ? `${totalDiscovered - totalSaved} already existed or were filtered.`
          : 'All apps checked.',
      });
    })();
  }, [state.isRunning, queryClient]);

  const dismiss = useCallback(() => {
    if (!state.isRunning) {
      setState({ isRunning: false, progress: {}, results: {}, appNames: {} });
    }
  }, [state.isRunning]);

  const hasProgress = Object.keys(state.progress).length > 0;

  return (
    <DiscoveryContext.Provider value={{ state, startBatchDiscovery, dismiss, hasProgress }}>
      {children}
    </DiscoveryContext.Provider>
  );
}
