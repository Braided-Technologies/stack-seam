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
        .select('*, applications(*, categories(name))')
        .eq('organization_id', orgId!);
      if (error) throw error;
      return data;
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
      const filePath = `${orgId}/${userApplicationId}/${Date.now()}_${file.name}`;
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
