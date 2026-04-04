import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search, BookOpen, Plus, ArrowLeft, Pencil, Trash2, FolderPlus,
  Rocket, LayoutGrid, DollarSign, Link2, Settings, Sparkles,
  ChevronRight, FileText, MessageSquare, Send, ImageIcon
} from 'lucide-react';
import ArticleRenderer from '@/components/ArticleRenderer';


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

// ─── Feedback Section (inline) ───
function FeedbackSection() {
  const { user, orgId } = useAuth();
  const queryClient = useQueryClient();
  const [type, setType] = useState('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: myFeedback = [] } = useQuery({
    queryKey: ['my-feedback', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('feedback')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const addFiles = useCallback((files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    const toAdd = imageFiles.slice(0, 5 - screenshots.length);
    if (toAdd.length === 0) {
      toast({ title: 'Maximum 5 screenshots', variant: 'destructive' });
      return;
    }
    setScreenshots(prev => [...prev, ...toAdd]);
    toAdd.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => setPreviews(prev => [...prev, e.target?.result as string]);
      reader.readAsDataURL(file);
    });
  }, [screenshots.length]);

  const removeScreenshot = (index: number) => {
    setScreenshots(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        addFiles(files);
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [addFiles]);

  const uploadScreenshots = async (): Promise<string[]> => {
    if (!user || screenshots.length === 0) return [];
    const urls: string[] = [];
    for (const file of screenshots) {
      const ext = file.name.split('.').pop() || 'png';
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from('feedback-screenshots')
        .upload(path, file, { cacheControl: '3600' });
      if (!error) urls.push(path);
    }
    return urls;
  };

  const handleSubmit = async () => {
    if (!title.trim() || !user) return;
    setSubmitting(true);
    try {
      const screenshotUrls = await uploadScreenshots();
      const insertData: any = {
        user_id: user.id,
        organization_id: orgId,
        type,
        title: title.trim(),
        description: description.trim() || null,
      };
      if (screenshotUrls.length > 0) insertData.screenshot_urls = screenshotUrls;
      const { error } = await supabase.from('feedback').insert(insertData);
      if (error) throw error;
      toast({ title: 'Feedback submitted', description: "Thank you! We'll review this shortly." });
      setTitle('');
      setDescription('');
      setType('bug');
      setScreenshots([]);
      setPreviews([]);
      queryClient.invalidateQueries({ queryKey: ['my-feedback'] });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'open': return 'destructive';
      case 'in_progress': return 'default';
      case 'resolved': case 'closed': return 'secondary';
      default: return 'outline';
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <Tabs defaultValue="submit">
        <TabsList className="w-full max-w-sm">
          <TabsTrigger value="submit" className="flex-1">Submit Feedback</TabsTrigger>
          <TabsTrigger value="history" className="flex-1">My Submissions ({myFeedback.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="submit" className="mt-6">
          <Card className="p-6 space-y-4">
            <div className="space-y-1 mb-2">
              <h3 className="font-semibold text-base">Send us feedback</h3>
              <p className="text-sm text-muted-foreground">Report a bug, suggest a feature, or ask a question. Our team reviews every submission.</p>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">🐛 Bug Report</SelectItem>
                  <SelectItem value="idea">💡 Feature Idea</SelectItem>
                  <SelectItem value="question">❓ Question</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Brief summary..." />
            </div>
            <div className="space-y-2">
              <Label>Details</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe in detail..." className="min-h-[100px]" />
            </div>

            {/* Screenshot Upload */}
            <div className="space-y-2">
              <Label>Screenshots (optional)</Label>
              <div
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-primary'); }}
                onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-primary'); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('border-primary');
                  addFiles(Array.from(e.dataTransfer.files));
                }}
                className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) addFiles(Array.from(e.target.files));
                    e.target.value = '';
                  }}
                />
                <ImageIcon className="h-6 w-6 mx-auto mb-1.5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drop images, <span className="text-primary font-medium">click to browse</span>, or paste from clipboard
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">PNG, JPG, GIF — max 5 files</p>
              </div>

              {previews.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-2">
                  {previews.map((src, i) => (
                    <div key={i} className="relative group">
                      <img src={src} alt={`Screenshot ${i + 1}`} className="h-20 w-20 object-cover rounded-md border border-border" />
                      <button
                        onClick={() => removeScreenshot(i)}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button onClick={handleSubmit} disabled={!title.trim() || submitting} className="w-full">
              <Send className="h-4 w-4 mr-2" /> {submitting ? 'Submitting...' : 'Submit Feedback'}
            </Button>
          </Card>
        </TabsContent>
        <TabsContent value="history" className="mt-6">
          {myFeedback.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">No submissions yet</p>
              <p className="text-xs mt-1">Your bug reports, feature ideas, and questions will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myFeedback.map((fb: any) => (
                <Card key={fb.id} className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={statusColor(fb.status) as any}>{fb.status.replace('_', ' ')}</Badge>
                    <Badge variant="outline">{fb.type}</Badge>
                    <span className="text-xs text-muted-foreground ml-auto">{new Date(fb.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="font-medium text-sm">{fb.title}</p>
                  {fb.description && <p className="text-xs text-muted-foreground">{fb.description}</p>}
                  {fb.screenshot_urls && (fb.screenshot_urls as string[]).length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {(fb.screenshot_urls as string[]).map((path: string, i: number) => (
                        <ScreenshotThumbnail key={i} path={path} />
                      ))}
                    </div>
                  )}
                  {fb.admin_response && (
                    <div className="bg-muted rounded-md p-2 text-xs">
                      <span className="font-medium">Response:</span> {fb.admin_response}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ScreenshotThumbnail({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    supabase.storage.from('feedback-screenshots').createSignedUrl(path, 3600).then(({ data }) => {
      if (data?.signedUrl) setUrl(data.signedUrl);
    });
  }, [path]);

  if (!url) return <div className="h-16 w-16 rounded-md bg-muted animate-pulse" />;

  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <img src={url} alt="Screenshot" className="h-16 w-16 object-cover rounded-md border border-border hover:opacity-80 transition-opacity" />
    </a>
  );
}


export default function Support() {
  const { userRole } = useAuth();
  const isPlatformAdmin = userRole === 'platform_admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const articleSlug = searchParams.get('article');
  const categoryView = searchParams.get('category');
  const activeTab = searchParams.get('tab') || 'kb';

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

  const setTab = (tab: string) => {
    setSearchParams({ tab });
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
          {(activeArticle as any).kb_categories?.name || 'Knowledge Base'}
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

        <ArticleRenderer content={activeArticle.content} />

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
          <ArrowLeft className="h-4 w-4" /> Support
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

  // ─── Main Support View with Tabs ───
  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Support</h1>
        <p className="text-muted-foreground text-sm mt-1">Find answers, browse guides, or reach out to our team</p>
      </div>

      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="kb" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" /> Knowledge Base
          </TabsTrigger>
          <TabsTrigger value="feedback" className="gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" /> Feedback & Tickets
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kb" className="mt-6">
          {/* Hero Search */}
          <div className="rounded-xl bg-primary/5 border border-primary/10 p-6 mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold mb-1">How can we help?</h2>
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
            <div className="relative mt-4 max-w-xl">
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
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{article.kb_categories?.name}</p>
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
        </TabsContent>

        <TabsContent value="feedback" className="mt-6">
          <FeedbackSection />
        </TabsContent>
      </Tabs>

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
