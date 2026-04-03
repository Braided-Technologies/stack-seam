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
