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
import {
  Search, BookOpen, Plus, ArrowLeft, Pencil, Trash2, FolderPlus,
  Rocket, LayoutGrid, DollarSign, Link2, Settings, Sparkles,
  ChevronRight, FileText
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const CATEGORY_ICONS: Record<string, any> = {
  'Getting Started': Rocket,
  'Stack Management': LayoutGrid,
  'Budget & Spend': DollarSign,
  'Integrations & Stack Map': Link2,
  'Settings & Team': Settings,
  'AI & Research': Sparkles,
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  'Getting Started': 'New to StackSeam? Start here with setup guides and orientation.',
  'Stack Management': 'Add apps, manage contacts, upload contracts, and export data.',
  'Budget & Spend': 'Track costs, view spend charts, and manage renewals.',
  'Integrations & Stack Map': 'Configure integrations and explore the visual Stack Map.',
  'Settings & Team': 'Invite teammates, manage roles, and connect external services.',
  'AI & Research': 'Use the AI Research Assistant and Help Center chatbot.',
};

export default function Help() {
  const { userRole } = useAuth();
  const isPlatformAdmin = userRole === 'platform_admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const articleSlug = searchParams.get('article');
  const categoryView = searchParams.get('category');

  const { data: categories = [] } = useKBCategories();
  const { data: articles = [] } = useKBArticles();
  const { data: activeArticle } = useKBArticleBySlug(articleSlug);

  const createArticle = useCreateKBArticle();
  const updateArticle = useUpdateKBArticle();
  const deleteArticle = useDeleteKBArticle();
  const createCategory = useCreateKBCategory();
  const deleteCategory = useDeleteKBCategory();

  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<any>(null);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const publishedArticles = useMemo(
    () => articles.filter((a: any) => a.is_published || isPlatformAdmin),
    [articles, isPlatformAdmin]
  );

  const searchResults = useMemo(() => {
    if (!search) return [];
    const q = search.toLowerCase();
    return publishedArticles.filter((a: any) =>
      a.title.toLowerCase().includes(q) ||
      a.content?.toLowerCase().includes(q) ||
      a.tags?.some((t: string) => t.toLowerCase().includes(q))
    );
  }, [publishedArticles, search]);

  const categoryArticles = useMemo(() => {
    if (!categoryView) return [];
    return publishedArticles.filter((a: any) => a.category_id === categoryView);
  }, [publishedArticles, categoryView]);

  const articlesByCategory = useMemo(() => {
    const map: Record<string, any[]> = {};
    publishedArticles.forEach((a: any) => {
      const catName = a.kb_categories?.name || 'Uncategorized';
      if (!map[catName]) map[catName] = [];
      map[catName].push(a);
    });
    return map;
  }, [publishedArticles]);

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
          id: editingArticle.id, title: editingArticle.title, slug: editingArticle.slug,
          content: editingArticle.content, category_id: editingArticle.category_id || null,
          tags: editingArticle.tags || [], is_published: editingArticle.is_published,
        });
      } else {
        await createArticle.mutateAsync({
          title: editingArticle.title, slug: editingArticle.slug,
          content: editingArticle.content, category_id: editingArticle.category_id || undefined,
          tags: editingArticle.tags || [], is_published: editingArticle.is_published,
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

  // ─── Article Detail View ───
  if (articleSlug && activeArticle) {
    const sameCategoryArticles = publishedArticles.filter(
      (a: any) => a.category_id === activeArticle.category_id && a.id !== activeArticle.id
    );

    return (
      <div className="max-w-4xl mx-auto p-6">
        <Button variant="ghost" className="mb-4 gap-2 text-muted-foreground hover:text-foreground" onClick={() => {
          if (activeArticle.category_id) {
            setSearchParams({ category: activeArticle.category_id });
          } else {
            setSearchParams({});
          }
        }}>
          <ArrowLeft className="h-4 w-4" />
          {(activeArticle as any).kb_categories?.name || 'Help Center'}
        </Button>

        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">{activeArticle.title}</h1>
            <div className="flex items-center gap-2 mt-2">
              {(activeArticle as any).kb_categories?.name && (
                <Badge variant="secondary">{(activeArticle as any).kb_categories.name}</Badge>
              )}
              {!activeArticle.is_published && <Badge variant="outline" className="text-yellow-500">Draft</Badge>}
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

        <div className="prose prose-sm dark:prose-invert max-w-none 
          prose-headings:scroll-mt-4 
          prose-h2:text-lg prose-h2:font-semibold prose-h2:mt-8 prose-h2:mb-3 prose-h2:border-b prose-h2:pb-2 prose-h2:border-border
          prose-h3:text-base prose-h3:font-medium prose-h3:mt-6 prose-h3:mb-2
          prose-table:border prose-table:border-border prose-table:rounded-md
          prose-th:bg-muted/50 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:text-xs prose-th:font-medium
          prose-td:px-3 prose-td:py-2 prose-td:text-sm prose-td:border-t prose-td:border-border
          prose-blockquote:border-l-primary prose-blockquote:bg-primary/5 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r-md prose-blockquote:not-italic
          prose-li:marker:text-primary
          prose-strong:text-foreground
          prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
        ">
          <ReactMarkdown>{activeArticle.content}</ReactMarkdown>
        </div>

        {/* Related articles in same category */}
        {sameCategoryArticles.length > 0 && (
          <div className="mt-12 pt-6 border-t border-border">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">Related articles</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {sameCategoryArticles.map((a: any) => (
                <Card
                  key={a.id}
                  className="p-3 cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => setSearchParams({ article: a.slug })}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm font-medium truncate">{a.title}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto flex-shrink-0" />
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Category Detail View ───
  if (categoryView) {
    const cat = categories.find((c: any) => c.id === categoryView);
    const catName = cat?.name || 'Category';
    const CatIcon = CATEGORY_ICONS[catName] || BookOpen;

    return (
      <div className="max-w-4xl mx-auto p-6">
        <Button variant="ghost" className="mb-4 gap-2 text-muted-foreground hover:text-foreground" onClick={() => setSearchParams({})}>
          <ArrowLeft className="h-4 w-4" /> Help Center
        </Button>

        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <CatIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{catName}</h1>
            <p className="text-sm text-muted-foreground">{CATEGORY_DESCRIPTIONS[catName] || `${categoryArticles.length} articles`}</p>
          </div>
        </div>

        <div className="space-y-2">
          {categoryArticles.map((article: any) => (
            <Card
              key={article.id}
              className="p-4 cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setSearchParams({ article: article.slug })}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <h3 className="font-medium text-sm">{article.title}</h3>
                    {!article.is_published && <Badge variant="outline" className="text-[10px] text-yellow-500">Draft</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 ml-6 line-clamp-2">
                    {article.content?.replace(/^#.*\n+/, '').substring(0, 150)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {isPlatformAdmin && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEditor(article); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </Card>
          ))}
          {categoryArticles.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No articles in this category yet.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Home / Browse View ───
  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* Hero Section */}
      <div className="rounded-xl bg-primary/5 border border-primary/10 p-8 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1">How can we help?</h1>
            <p className="text-muted-foreground text-sm">Search our knowledge base or browse topics below</p>
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
        <div className="relative mt-5 max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search for answers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background"
          />
        </div>
      </div>

      {/* Search Results */}
      {search ? (
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{search}"
          </p>
          <div className="space-y-2">
            {searchResults.map((article: any) => (
              <Card
                key={article.id}
                className="p-4 cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => { setSearch(''); setSearchParams({ article: article.slug }); }}
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm">{article.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {article.kb_categories?.name}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Card>
            ))}
            {searchResults.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium">No results found</p>
                <p className="text-xs mt-1">Try different keywords or browse by topic</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Category Cards Grid */
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Browse by topic</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat: any) => {
              const CatIcon = CATEGORY_ICONS[cat.name] || BookOpen;
              const catArticles = articlesByCategory[cat.name] || [];
              return (
                <Card
                  key={cat.id}
                  className="p-5 cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all group"
                  onClick={() => setSearchParams({ category: cat.id })}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
                      <CatIcon className="h-4.5 w-4.5 text-primary" />
                    </div>
                    {isPlatformAdmin && (
                      <button
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                        onClick={(e) => { e.stopPropagation(); deleteCategory.mutate(cat.id); }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <h3 className="font-semibold text-sm mb-1">{cat.name}</h3>
                  <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                    {CATEGORY_DESCRIPTIONS[cat.name] || `${catArticles.length} articles`}
                  </p>
                  {/* Top articles preview */}
                  <div className="space-y-1">
                    {catArticles.slice(0, 3).map((a: any) => (
                      <div
                        key={a.id}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                        onClick={(e) => { e.stopPropagation(); setSearchParams({ article: a.slug }); }}
                      >
                        <ChevronRight className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{a.title}</span>
                      </div>
                    ))}
                  </div>
                  {catArticles.length > 3 && (
                    <p className="text-xs text-primary mt-2 font-medium">
                      View all {catArticles.length} articles →
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
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
                  <Input value={editingArticle.slug} onChange={(e) => setEditingArticle({ ...editingArticle, slug: e.target.value })} placeholder="getting-started" />
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
                  placeholder="setup, integrations, rmm"
                />
              </div>
              <div className="space-y-2">
                <Label>Content (Markdown)</Label>
                <Textarea value={editingArticle.content} onChange={(e) => setEditingArticle({ ...editingArticle, content: e.target.value })} rows={12} className="font-mono text-xs" />
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
