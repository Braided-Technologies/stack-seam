import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useKBCategories, useKBArticles, useKBArticleBySlug, useCreateKBArticle, useUpdateKBArticle, useDeleteKBArticle, useCreateKBCategory, useDeleteKBCategory } from '@/hooks/useKBData';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import { Search, BookOpen, Plus, ArrowLeft, Pencil, Trash2, FolderPlus } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function Help() {
  const { userRole } = useAuth();
  const isPlatformAdmin = userRole === 'platform_admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const articleSlug = searchParams.get('article');

  const { data: categories = [] } = useKBCategories();
  const { data: articles = [] } = useKBArticles();
  const { data: activeArticle } = useKBArticleBySlug(articleSlug);

  const createArticle = useCreateKBArticle();
  const updateArticle = useUpdateKBArticle();
  const deleteArticle = useDeleteKBArticle();
  const createCategory = useCreateKBCategory();
  const deleteCategory = useDeleteKBCategory();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<any>(null);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const filteredArticles = useMemo(() => {
    let filtered = articles.filter((a: any) => a.is_published || isPlatformAdmin);
    if (selectedCategory) filtered = filtered.filter((a: any) => a.category_id === selectedCategory);
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((a: any) =>
        a.title.toLowerCase().includes(q) ||
        a.content?.toLowerCase().includes(q) ||
        a.tags?.some((t: string) => t.toLowerCase().includes(q))
      );
    }
    return filtered;
  }, [articles, search, selectedCategory, isPlatformAdmin]);

  const openEditor = (article?: any) => {
    setEditingArticle(article ? { ...article } : {
      title: '', slug: '', content: '', category_id: '', tags: [], is_published: false,
    });
    setEditorOpen(true);
  };

  const saveArticle = async () => {
    if (!editingArticle?.title || !editingArticle?.slug) {
      toast({ title: 'Title and slug are required', variant: 'destructive' });
      return;
    }
    try {
      if (editingArticle.id) {
        await updateArticle.mutateAsync({
          id: editingArticle.id,
          title: editingArticle.title,
          slug: editingArticle.slug,
          content: editingArticle.content,
          category_id: editingArticle.category_id || null,
          tags: editingArticle.tags || [],
          is_published: editingArticle.is_published,
        });
      } else {
        await createArticle.mutateAsync({
          title: editingArticle.title,
          slug: editingArticle.slug,
          content: editingArticle.content,
          category_id: editingArticle.category_id || undefined,
          tags: editingArticle.tags || [],
          is_published: editingArticle.is_published,
        });
      }
      setEditorOpen(false);
      toast({ title: editingArticle.id ? 'Article updated' : 'Article created' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleDeleteArticle = async (id: string) => {
    if (!confirm('Delete this article?')) return;
    try {
      await deleteArticle.mutateAsync(id);
      if (articleSlug) setSearchParams({});
      toast({ title: 'Article deleted' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      await createCategory.mutateAsync({ name: newCatName.trim() });
      setNewCatName('');
      setNewCatOpen(false);
      toast({ title: 'Category created' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  // Article detail view
  if (articleSlug && activeArticle) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Button variant="ghost" className="mb-4 gap-2" onClick={() => setSearchParams({})}>
          <ArrowLeft className="h-4 w-4" /> Back to Help Center
        </Button>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{activeArticle.title}</h1>
            <div className="flex items-center gap-2 mt-2">
              {(activeArticle as any).kb_categories?.name && (
                <Badge variant="secondary">{(activeArticle as any).kb_categories.name}</Badge>
              )}
              {!activeArticle.is_published && <Badge variant="outline" className="text-yellow-500">Draft</Badge>}
              {activeArticle.tags?.map((t: string) => (
                <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
              ))}
            </div>
          </div>
          {isPlatformAdmin && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => openEditor(activeArticle)}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
              <Button variant="destructive" size="sm" onClick={() => handleDeleteArticle(activeArticle.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
        <Separator className="mb-6" />
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown>{activeArticle.content}</ReactMarkdown>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Help Center</h1>
          <p className="text-muted-foreground text-sm mt-1">Browse articles and guides to get the most out of StackSeam</p>
        </div>
        {isPlatformAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setNewCatOpen(true)}>
              <FolderPlus className="h-3.5 w-3.5 mr-1" /> Category
            </Button>
            <Button size="sm" onClick={() => openEditor()}>
              <Plus className="h-3.5 w-3.5 mr-1" /> New Article
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search articles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <Badge
            variant={selectedCategory === null ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setSelectedCategory(null)}
          >
            All
          </Badge>
          {categories.map((cat: any) => (
            <Badge
              key={cat.id}
              variant={selectedCategory === cat.id ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setSelectedCategory(cat.id)}
            >
              {cat.name}
              {isPlatformAdmin && (
                <button
                  className="ml-1 hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); deleteCategory.mutate(cat.id); }}
                >
                  ×
                </button>
              )}
            </Badge>
          ))}
        </div>
      </div>

      {filteredArticles.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="font-medium">No articles found</p>
          <p className="text-sm mt-1">
            {isPlatformAdmin ? 'Create your first knowledge base article to get started.' : 'Check back later for new content.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filteredArticles.map((article: any) => (
            <Card
              key={article.id}
              className="p-4 cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setSearchParams({ article: article.slug })}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm truncate">{article.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {article.content?.substring(0, 120)}...
                  </p>
                  <div className="flex items-center gap-1.5 mt-2">
                    {article.kb_categories?.name && (
                      <Badge variant="secondary" className="text-[10px]">{article.kb_categories.name}</Badge>
                    )}
                    {!article.is_published && <Badge variant="outline" className="text-[10px] text-yellow-500">Draft</Badge>}
                  </div>
                </div>
                {isPlatformAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 flex-shrink-0"
                    onClick={(e) => { e.stopPropagation(); openEditor(article); }}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Article editor dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingArticle?.id ? 'Edit Article' : 'New Article'}</DialogTitle>
            <DialogDescription>Write your knowledge base article in Markdown format.</DialogDescription>
          </DialogHeader>
          {editingArticle && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input value={editingArticle.title} onChange={(e) => setEditingArticle({ ...editingArticle, title: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Slug</Label>
                  <Input
                    value={editingArticle.slug}
                    onChange={(e) => setEditingArticle({ ...editingArticle, slug: e.target.value })}
                    placeholder="getting-started"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={editingArticle.category_id || ''} onValueChange={(v) => setEditingArticle({ ...editingArticle, category_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tags (comma-separated)</Label>
                <Input
                  value={(editingArticle.tags || []).join(', ')}
                  onChange={(e) => setEditingArticle({ ...editingArticle, tags: e.target.value.split(',').map((t: string) => t.trim()).filter(Boolean) })}
                  placeholder="setup, integrations, rMM"
                />
              </div>
              <div className="space-y-2">
                <Label>Content (Markdown)</Label>
                <Textarea
                  value={editingArticle.content}
                  onChange={(e) => setEditingArticle({ ...editingArticle, content: e.target.value })}
                  rows={12}
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch checked={editingArticle.is_published} onCheckedChange={(v) => setEditingArticle({ ...editingArticle, is_published: v })} />
                  <Label>Published</Label>
                </div>
                <Button onClick={saveArticle} disabled={createArticle.isPending || updateArticle.isPending}>
                  {editingArticle.id ? 'Save Changes' : 'Create Article'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* New category dialog */}
      <Dialog open={newCatOpen} onOpenChange={setNewCatOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New KB Category</DialogTitle>
            <DialogDescription>Create a category to organize your articles.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Category name" />
            <Button onClick={handleCreateCategory} disabled={!newCatName.trim()} className="w-full">Create Category</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
