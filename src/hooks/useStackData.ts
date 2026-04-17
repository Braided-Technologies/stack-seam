import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('display_order');
      if (error) throw error;
      return data;
    },
  });
}

export function useApplications() {
  return useQuery({
    queryKey: ['applications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select('*, categories(name)')
        .order('name');
      if (error) throw error;
      return data;
    },
  });
}

export function useUserApplications() {
  const { orgId } = useAuth();
  return useQuery({
    queryKey: ['user_applications', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_applications')
        .select('*, applications(*, categories(name)), user_application_contracts(*)')
        .eq('organization_id', orgId!);
      if (error) throw error;
      // Sort contracts deterministically (display_order, then created_at)
      for (const ua of (data || []) as any[]) {
        if (Array.isArray(ua.user_application_contracts)) {
          ua.user_application_contracts.sort((a: any, b: any) => {
            if (a.display_order !== b.display_order) return a.display_order - b.display_order;
            return (a.created_at || '').localeCompare(b.created_at || '');
          });
        }
      }
      return data;
    },
  });
}

export function useUserApplicationContracts(userApplicationId?: string) {
  return useQuery({
    queryKey: ['user_application_contracts', userApplicationId],
    enabled: !!userApplicationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_application_contracts')
        .select('*')
        .eq('user_application_id', userApplicationId!)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertUserApplicationContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { id?: string; user_application_id: string; [key: string]: any }) => {
      if (row.id) {
        const { id, ...updates } = row;
        const { data, error } = await supabase
          .from('user_application_contracts')
          .update(updates)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from('user_application_contracts')
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['user_application_contracts', vars.user_application_id] });
      qc.invalidateQueries({ queryKey: ['user_applications'] });
    },
  });
}

export function useDeleteUserApplicationContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; user_application_id: string }) => {
      const { error } = await supabase.from('user_application_contracts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['user_application_contracts', vars.user_application_id] });
      qc.invalidateQueries({ queryKey: ['user_applications'] });
    },
  });
}

export function useAddUserApplication() {
  const qc = useQueryClient();
  const { orgId } = useAuth();
  return useMutation({
    mutationFn: async (applicationId: string) => {
      const { error } = await supabase
        .from('user_applications')
        .insert({ organization_id: orgId!, application_id: applicationId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user_applications'] }),
  });
}

export function useRemoveUserApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_applications').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user_applications'] }),
  });
}

export function useUpdateUserApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { error } = await supabase.from('user_applications').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user_applications'] }),
  });
}

export function useIntegrations() {
  return useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integrations')
        .select('*, source:applications!integrations_source_app_id_fkey(id, name, categories(name)), target:applications!integrations_target_app_id_fkey(id, name, categories(name))');
      if (error) throw error;
      return data;
    },
  });
}

export function useContacts(userApplicationId?: string) {
  return useQuery({
    queryKey: ['contacts', userApplicationId],
    enabled: !!userApplicationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_application_id', userApplicationId!);
      if (error) throw error;
      return data;
    },
  });
}

export function useAddContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contact: { user_application_id: string; name: string; email?: string; phone?: string; role?: string; support_url?: string; is_primary?: boolean }) => {
      const { error } = await supabase.from('contacts').insert(contact);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['contacts', vars.user_application_id] }),
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, userApplicationId, ...updates }: { id: string; userApplicationId: string; name?: string; email?: string | null; phone?: string | null; role?: string | null; support_url?: string | null }) => {
      const { error } = await supabase.from('contacts').update(updates).eq('id', id);
      if (error) throw error;
      return userApplicationId;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['contacts', vars.userApplicationId] }),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, userApplicationId }: { id: string; userApplicationId: string }) => {
      const { error } = await supabase.from('contacts').delete().eq('id', id);
      if (error) throw error;
      return userApplicationId;
    },
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['contacts', vars.userApplicationId] }),
  });
}

export function useContractFiles(userApplicationId?: string) {
  return useQuery({
    queryKey: ['contract_files', userApplicationId],
    enabled: !!userApplicationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_files')
        .select('*')
        .eq('user_application_id', userApplicationId!);
      if (error) throw error;
      return data;
    },
  });
}

export function useUploadContract() {
  const qc = useQueryClient();
  const { orgId, user } = useAuth();
  return useMutation({
    mutationFn: async ({ file, userApplicationId }: { file: File; userApplicationId: string }) => {
      // Sanitize filename: replace spaces/special chars that Supabase Storage
      // rejects in object keys. Preserve the extension and original name for display.
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${orgId}/${userApplicationId}/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('contracts')
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: dbData, error: dbError } = await supabase.from('contract_files').insert({
        user_application_id: userApplicationId,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        uploaded_by: user!.id,
      }).select().single();
      if (dbError) throw dbError;
      return dbData;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['contract_files', vars.userApplicationId] }),
  });
}

export function useDeleteContractFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, filePath, userApplicationId }: { id: string; filePath: string; userApplicationId: string }) => {
      await supabase.storage.from('contracts').remove([filePath]);
      const { error } = await supabase.from('contract_files').delete().eq('id', id);
      if (error) throw error;
      return userApplicationId;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['contract_files', vars.userApplicationId] }),
  });
}

export function useSearchTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (query: string) => {
      const { data, error } = await supabase.functions.invoke('search-tool', {
        body: { query },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applications'] }),
  });
}

type DiscoverIntegrationsInput = string[] | { appNames: string[]; focusApp?: string };

// Legacy: kept for backward compat but unused
export function useDiscoverIntegrations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DiscoverIntegrationsInput) => {
      const body = Array.isArray(input)
        ? { app_names: input }
        : { app_names: input.appNames, focus_app: input.focusApp };

      const { data, error } = await supabase.functions.invoke('discover-integrations', {
        body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['integrations'] });
    },
  });
}

export function useDeepScanIntegrations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ focusApp, stackAppNames }: { focusApp: string; stackAppNames: string[] }) => {
      const { data, error } = await supabase.functions.invoke('discover-integrations-deep', {
        body: { focus_app: focusApp, stack_app_names: stackAppNames, remove_undocumented: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['integrations'] });
    },
  });
}

// New job-based discovery system
export interface DiscoveryJob {
  id: string;
  organization_id: string;
  job_type: 'full_scan' | 'deep_scan' | 'pair_scan' | 'revalidation';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  focus_app_id: string | null;
  total_pairs: number;
  processed_pairs: number;
  found_count: number;
  error_message: string | null;
  result: any;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export function useStartDiscoveryJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ organizationId, jobType, focusAppId }: { organizationId: string; jobType: 'full_scan' | 'deep_scan'; focusAppId?: string }) => {
      // Create the job row
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: job, error } = await supabase
        .from('discovery_jobs')
        .insert({
          organization_id: organizationId,
          created_by: user.id,
          job_type: jobType,
          focus_app_id: focusAppId || null,
          status: 'pending',
        })
        .select()
        .single();
      if (error) throw error;

      // Trigger processing
      await supabase.functions.invoke('process-discovery-job', {
        body: { job_id: job.id },
      });

      return job as DiscoveryJob;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['discovery-jobs'] });
    },
  });
}

export function useDiscoveryJob(jobId: string | null) {
  return useQuery({
    queryKey: ['discovery-job', jobId],
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data as DiscoveryJob | undefined;
      if (!data) return 2000;
      if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') return false;
      return 2000;
    },
    queryFn: async () => {
      if (!jobId) return null;
      const { data, error } = await supabase
        .from('discovery_jobs')
        .select('*')
        .eq('id', jobId)
        .single();
      if (error) throw error;
      return data as DiscoveryJob;
    },
  });
}

// Returns the currently-running (or pending) job for the org, if any.
// Used cross-page to reflect in-progress discovery state.
// Watchdog: process-discovery-job self-chains in ~120s batches and touches updated_at
// on every pair. If updated_at is stale >3 min, something really is stuck — fail it.
export function useActiveDiscoveryJob(orgId: string | null) {
  return useQuery({
    queryKey: ['active-discovery-job', orgId],
    enabled: !!orgId,
    refetchInterval: 2000,
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from('discovery_jobs')
        .select('*')
        .eq('organization_id', orgId)
        .in('status', ['pending', 'running'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      if (!data) return null;

      const lastTouch = (data as any).updated_at || data.started_at || data.created_at;
      const staleMs = Date.now() - new Date(lastTouch).getTime();
      if (staleMs > 3 * 60 * 1000) {
        await supabase.from('discovery_jobs').update({
          status: 'failed',
          error_message: `No progress for ${Math.round(staleMs / 1000)}s — edge function likely died mid-batch`,
          completed_at: new Date().toISOString(),
        }).eq('id', data.id);
        return null;
      }

      return data as DiscoveryJob | null;
    },
  });
}

export function useReportIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ integrationId, vote, reason }: { integrationId: string; vote: 'upvote' | 'report' | 'dead_link'; reason?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('integration_reports').insert({
        integration_id: integrationId,
        reported_by: user.id,
        vote,
        reason: reason || vote,
      });
      if (error) {
        // Duplicate vote — already recorded, treat as success
        if (error.code === '23505' || error.message.toLowerCase().includes('duplicate')) {
          return { alreadyVoted: true, vote };
        }
        throw error;
      }
      return { alreadyVoted: false, vote };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integrations'] });
    },
  });
}
