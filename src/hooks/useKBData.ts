import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useKBCategories() {
  return useQuery({
    queryKey: ['kb_categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kb_categories')
        .select('*')
        .order('display_order');
      if (error) throw error;
      return data;
    },
  });
}

export function useKBArticles(categoryId?: string) {
  return useQuery({
    queryKey: ['kb_articles', categoryId],
    queryFn: async () => {
      let q = supabase
        .from('kb_articles')
        .select('*, kb_categories(name, icon)')
        .order('display_order');
      if (categoryId) q = q.eq('category_id', categoryId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useKBArticleBySlug(slug: string | null) {
  return useQuery({
    queryKey: ['kb_article', slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kb_articles')
        .select('*, kb_categories(name, icon)')
        .eq('slug', slug!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateKBArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (article: { title: string; slug: string; content: string; category_id?: string; tags?: string[]; is_published?: boolean }) => {
      const { error } = await supabase.from('kb_articles').insert(article);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kb_articles'] }),
  });
}

export function useUpdateKBArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { error } = await supabase.from('kb_articles').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kb_articles'] }),
  });
}

export function useDeleteKBArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('kb_articles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kb_articles'] }),
  });
}

export function useCreateKBCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cat: { name: string; icon?: string }) => {
      const { error } = await supabase.from('kb_categories').insert(cat);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kb_categories'] }),
  });
}

export function useDeleteKBCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('kb_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kb_categories'] }),
  });
}
