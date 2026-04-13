import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

type AppStatus = 'queued' | 'in_progress' | 'done' | 'error';
type AppResult = { saved?: number; error?: string };

interface DiscoveryJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  job_type: string;
  focus_app_id: string | null;
  total_pairs: number;
  processed_pairs: number;
  found_count: number;
  error_message: string | null;
}

interface DiscoveryState {
  isRunning: boolean;
  progress: Record<string, AppStatus>;
  results: Record<string, AppResult>;
  appNames: Record<string, string>;
  jobId: string | null;
  totalPairs: number;
  processedPairs: number;
  foundCount: number;
}

interface DiscoveryContextType {
  state: DiscoveryState;
  startBatchDiscovery: (userApps: { application_id: string; applications?: { name?: string } | null }[]) => Promise<void>;
  startFocusedDiscovery: (focusAppId: string, focusAppName: string) => Promise<void>;
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
    jobId: null,
    totalPairs: 0,
    processedPairs: 0,
    foundCount: 0,
  });
  const queryClient = useQueryClient();
  const { orgId } = useAuth();

  // Poll the job for progress while running
  useEffect(() => {
    if (!state.jobId || !state.isRunning) return;

    const interval = setInterval(async () => {
      const { data: job, error } = await supabase
        .from('discovery_jobs')
        .select('*')
        .eq('id', state.jobId!)
        .single();

      if (error || !job) return;

      const typedJob = job as unknown as DiscoveryJob;
      setState(prev => ({
        ...prev,
        totalPairs: typedJob.total_pairs,
        processedPairs: typedJob.processed_pairs,
        foundCount: typedJob.found_count,
      }));

      if (typedJob.status === 'completed' || typedJob.status === 'failed' || typedJob.status === 'cancelled') {
        setState(prev => ({ ...prev, isRunning: false }));
        await queryClient.invalidateQueries({ queryKey: ['integrations'] });

        if (typedJob.status === 'completed') {
          toast({
            title: `Discovery complete: ${typedJob.found_count} integration${typedJob.found_count === 1 ? '' : 's'} found`,
            description: `Scanned ${typedJob.processed_pairs} pair${typedJob.processed_pairs === 1 ? '' : 's'}.`,
          });
        } else {
          toast({
            title: 'Discovery failed',
            description: typedJob.error_message || 'Unknown error',
            variant: 'destructive',
          });
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [state.jobId, state.isRunning, queryClient]);

  const startBatchDiscovery = useCallback(async (userApps: { application_id: string; applications?: { name?: string } | null }[]) => {
    if (state.isRunning) return;
    if (!orgId) {
      toast({ title: 'No organization', variant: 'destructive' });
      return;
    }

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

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: job, error } = await supabase
        .from('discovery_jobs')
        .insert({
          organization_id: orgId,
          created_by: user.id,
          job_type: 'full_scan',
          status: 'pending',
        })
        .select()
        .single();
      if (error) throw error;

      await supabase.functions.invoke('process-discovery-job', {
        body: { job_id: job.id },
      });

      setState({
        isRunning: true,
        progress: initialProgress,
        results: {},
        appNames,
        jobId: job.id,
        totalPairs: 0,
        processedPairs: 0,
        foundCount: 0,
      });

      toast({ title: 'Discovery started', description: `Scanning ${stackNames.length} apps…` });
    } catch (e: any) {
      toast({ title: 'Failed to start discovery', description: e.message, variant: 'destructive' });
    }
  }, [state.isRunning, orgId]);

  const startFocusedDiscovery = useCallback(async (focusAppId: string, focusAppName: string) => {
    if (state.isRunning) return;
    if (!orgId) {
      toast({ title: 'No organization', variant: 'destructive' });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: job, error } = await supabase
        .from('discovery_jobs')
        .insert({
          organization_id: orgId,
          created_by: user.id,
          job_type: 'deep_scan',
          focus_app_id: focusAppId,
          status: 'pending',
        })
        .select()
        .single();
      if (error) throw error;

      await supabase.functions.invoke('process-discovery-job', {
        body: { job_id: job.id },
      });

      setState({
        isRunning: true,
        progress: { [focusAppId]: 'in_progress' },
        results: {},
        appNames: { [focusAppId]: focusAppName },
        jobId: job.id,
        totalPairs: 0,
        processedPairs: 0,
        foundCount: 0,
      });

      toast({ title: `Scanning ${focusAppName}…` });
    } catch (e: any) {
      toast({ title: 'Failed to start discovery', description: e.message, variant: 'destructive' });
    }
  }, [state.isRunning, orgId]);

  const dismiss = useCallback(() => {
    if (!state.isRunning) {
      setState({
        isRunning: false,
        progress: {},
        results: {},
        appNames: {},
        jobId: null,
        totalPairs: 0,
        processedPairs: 0,
        foundCount: 0,
      });
    }
  }, [state.isRunning]);

  const hasProgress = Object.keys(state.progress).length > 0 || state.totalPairs > 0;

  return (
    <DiscoveryContext.Provider value={{ state, startBatchDiscovery, startFocusedDiscovery, dismiss, hasProgress }}>
      {children}
    </DiscoveryContext.Provider>
  );
}
