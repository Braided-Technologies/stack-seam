import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { useAddUserApplication, useCategories } from '@/hooks/useStackData';
import { Search, Plus, Loader2, Check, ExternalLink, BookOpen, Globe } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CategoryCombobox } from '@/components/ui/category-combobox';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface SearchToolDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type DialogStep = 'search' | 'confirm';

export default function SearchToolDialog({ open, onOpenChange }: SearchToolDialogProps) {
  const { orgId } = useAuth();
  const { data: categories = [] } = useCategories();
  const addApp = useAddUserApplication();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<DialogStep>('search');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  // Existing matches from catalog
  const [existingApps, setExistingApps] = useState<any[]>([]);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  // Scraped / confirm data
  const [confirmData, setConfirmData] = useState<{
    name: string;
    description: string;
    vendor_url: string;
    category_id: string;
  }>({ name: '', description: '', vendor_url: '', category_id: '' });

  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const resetDialog = () => {
    setStep('search');
    setName('');
    setUrl('');
    setExistingApps([]);
    setAddedIds(new Set());
    setConfirmData({ name: '', description: '', vendor_url: '', category_id: '' });
  };

  const guessCategory = (text: string): string => {
    const t = text.toLowerCase();
    const keywords: [string[], string][] = [
      [['rmm', 'remote monitoring', 'remote management', 'endpoint monitoring'], 'RMM'],
      [['psa', 'ticketing', 'helpdesk', 'help desk', 'service desk', 'itsm'], 'PSA / Ticketing'],
      [['backup', 'disaster recovery', 'bcdr', 'data protection', 'recovery'], 'Backup & DR'],
      [['endpoint protection', 'antivirus', 'anti-virus', 'edr', 'xdr', 'malware', 'threat'], 'Cybersecurity'],
      [['email security', 'phishing', 'anti-phishing', 'email protection', 'spam'], 'Email Security'],
      [['identity', 'access management', 'sso', 'single sign', 'mfa', 'multi-factor', 'password manager'], 'Identity & Access'],
      [['documentation', 'knowledge base', 'wiki', 'it documentation'], 'Documentation'],
      [['monitoring', 'observability', 'apm', 'infrastructure monitoring', 'network monitor'], 'Monitoring'],
      [['firewall', 'networking', 'sd-wan', 'router', 'switch', 'wifi', 'wi-fi', 'network management'], 'Networking'],
      [['dns filter', 'web filter', 'content filter', 'dns security'], 'DNS Filtering'],
      [['compliance', 'grc', 'governance', 'risk', 'audit'], 'GRC / Compliance'],
      [['security awareness', 'phishing simulation', 'training'], 'Security Awareness Training'],
      [['vulnerability', 'penetration', 'pentest', 'security testing', 'scanner'], 'Security Testing'],
      [['cloud', 'azure', 'aws', 'gcp', 'iaas'], 'Cloud Platforms'],
      [['crm', 'sales', 'pipeline', 'lead'], 'Sales & CRM'],
      [['accounting', 'bookkeeping', 'financial'], 'Accounting'],
      [['billing', 'invoicing', 'payment', 'quoting'], 'Billing & Invoicing'],
      [['hr', 'human resource', 'payroll', 'employee'], 'HR'],
      [['collaboration', 'email', 'productivity', 'office 365', 'microsoft 365', 'google workspace'], 'Email & Collaboration'],
      [['communication', 'voip', 'phone', 'video conferenc', 'ucaas'], 'Communication'],
      [['endpoint management', 'mdm', 'device management', 'intune', 'patch'], 'Endpoint Management'],
      [['m365', 'microsoft 365 management', 'tenant'], 'M365 Management'],
      [['virtualization', 'hypervisor', 'vm', 'virtual machine'], 'Virtualization'],
      [['vcio', 'qbr', 'strategy', 'technology business review', 'asset management', 'asset tracking', 'hardware lifecycle', 'warranty lookup', 'cmdb'], 'vCIO / Lifecycle Management'],
      [['alerting', 'incident', 'on-call', 'pagerduty'], 'Alerting & Incident Management'],
      [['client portal', 'service portal'], 'Client Portal'],
      [['workflow automation', 'msp automation', 'rpa', 'no-code', 'low-code', 'iterative automation', 'orchestration'], 'Automation & Workflow'],
      [['ai', 'artificial intelligence', 'llm', 'machine learning'], 'AI & LLMs'],
      [['distributor', 'marketplace', 'channel'], 'Distributors'],
      [['design', 'creative', 'graphic'], 'Design & Creative'],
      [['social media', 'social management'], 'Social Media'],
      [['background check', 'screening'], 'Background Check'],
    ];
    for (const [kws, catName] of keywords) {
      if (kws.some(kw => t.includes(kw))) {
        const cat = categories.find(c => c.name === catName);
        if (cat) return cat.id;
      }
    }
    return '';
  };

  const handleSearch = async () => {
    if (name.trim().length < 2) return;
    setSearching(true);
    setExistingApps([]);

    try {
      const { data, error } = await supabase.functions.invoke('search-tool', {
        body: { query: name.trim(), url: url.trim() || undefined },
      });
      if (error) throw error;

      if (data.found && data.existing && data.applications?.length > 0) {
        setExistingApps(data.applications);
      } else if (!data.found && data.scraped) {
        const desc = data.scraped.description || '';
        const guessedCatId = guessCategory(`${data.scraped.name || name} ${desc}`);
        setConfirmData({
          name: data.scraped.name || name.trim(),
          description: desc,
          vendor_url: data.scraped.vendor_url || url.trim(),
          category_id: guessedCatId,
        });
        setStep('confirm');
      } else {
        setConfirmData({
          name: name.trim(),
          description: '',
          vendor_url: url.trim(),
          category_id: '',
        });
        setStep('confirm');
      }
    } catch (e: any) {
      toast({ title: 'Search failed', description: e.message, variant: 'destructive' });
    } finally {
      setSearching(false);
    }
  };

  const handleSubmitNewTool = async () => {
    if (!confirmData.name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      // Insert as pending for platform admin review
      const { data: newApp, error } = await supabase
        .from('applications')
        .insert({
          name: confirmData.name.trim(),
          description: confirmData.description.trim() || null,
          vendor_url: confirmData.vendor_url.trim() || null,
          category_id: confirmData.category_id || null,
          status: 'org_only',
          submitted_by_org: orgId,
        })
        .select('*, categories(name)')
        .single();

      if (error) {
        if (error.code === '23505') {
          toast({ title: 'This tool already exists in the catalog', variant: 'destructive' });
        } else {
          throw error;
        }
        return;
      }

      toast({
        title: 'Tool submitted for review',
        description: 'A platform administrator will review and approve it.',
      });

      queryClient.invalidateQueries({ queryKey: ['applications'] });

      // Offer to add to stack immediately
      if (newApp) {
        setExistingApps([newApp]);
        setStep('search');
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddToStack = async (appId: string) => {
    try {
      await addApp.mutateAsync(appId);
      setAddedIds(prev => new Set(prev).add(appId));
      toast({ title: 'Added to stack' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleCategoryChange = async (appId: string, categoryId: string) => {
    try {
      const { error } = await supabase.functions.invoke('search-tool', {
        body: { updateCategory: true, appId, categoryId },
      });
      if (error) throw error;
      const catName = categories.find(c => c.id === categoryId)?.name;
      toast({ title: `Category updated to ${catName}` });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
    } catch (e: any) {
      toast({ title: 'Error updating category', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        onOpenChange(o);
        if (!o) resetDialog();
      }}
    >
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{step === 'confirm' ? 'Confirm Tool Details' : 'Find a Tool'}</DialogTitle>
          <DialogDescription>
            {step === 'confirm'
              ? 'Review and adjust the details below. The tool will be submitted for admin approval.'
              : 'Search by name. If it\'s not in the catalog, provide the vendor URL and we\'ll look it up.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'search' && (
          <>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Tool Name <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="e.g. Drata, Vanta, ConnectWise..."
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Vendor URL <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="e.g. drata.com or https://www.drata.com"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    className="pl-9"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  We'll fetch the tool's description and details from this URL
                </p>
              </div>
              <Button
                onClick={handleSearch}
                disabled={searching || name.trim().length < 2 || url.trim().length < 2}
                className="w-full"
              >
                {searching ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Searching...</>
                ) : (
                  <><Search className="h-4 w-4 mr-2" /> Search</>
                )}
              </Button>
            </div>

            {/* Existing matches */}
            {existingApps.length > 0 && (
              <div className="space-y-2 mt-2">
                <p className="text-sm text-muted-foreground">
                  {existingApps[0]?.status === 'pending' ? 'Submitted (pending review):' : 'Found in catalog:'}
                </p>
                {existingApps.map((app: any) => (
                  <div key={app.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{app.name}</p>
                          {app.status === 'pending' && (
                            <Badge variant="outline" className="text-xs text-yellow-600">Pending</Badge>
                          )}
                          {app.vendor_url && (
                            <a
                              href={app.vendor_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                        {app.description && (
                          <p className="text-xs text-muted-foreground">{app.description}</p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant={addedIds.has(app.id) ? 'secondary' : 'default'}
                        disabled={addedIds.has(app.id) || addApp.isPending}
                        onClick={() => handleAddToStack(app.id)}
                      >
                        {addedIds.has(app.id) ? (
                          <><Check className="h-3 w-3 mr-1" /> In Stack</>
                        ) : (
                          <><Plus className="h-3 w-3 mr-1" /> Add to Stack</>
                        )}
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Category:</span>
                      <Select
                        value={app.category_id || ''}
                        onValueChange={v => handleCategoryChange(app.id, v)}
                      >
                        <SelectTrigger className="h-7 text-xs w-auto min-w-[140px]">
                          <SelectValue placeholder={app.categories?.name || 'Select...'} />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map(cat => (
                            <SelectItem key={cat.id} value={cat.id} className="text-xs">
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {step === 'confirm' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input
                value={confirmData.name}
                onChange={e => setConfirmData(d => ({ ...d, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <textarea
                className="flex min-h-[60px] max-h-[140px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none overflow-y-auto"
                value={confirmData.description}
                onChange={e => setConfirmData(d => ({ ...d, description: e.target.value.slice(0, 500) }))}
                placeholder="Brief description of the tool..."
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">{confirmData.description.length}/500</p>
            </div>
            <div className="space-y-1.5">
              <Label>Vendor URL</Label>
              <Input
                value={confirmData.vendor_url}
                onChange={e => setConfirmData(d => ({ ...d, vendor_url: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <CategoryCombobox
                categories={categories}
                value={confirmData.category_id}
                onChange={v => setConfirmData(d => ({ ...d, category_id: v }))}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep('search')} className="flex-1">
                Back
              </Button>
              <Button
                onClick={handleSubmitNewTool}
                disabled={submitting || !confirmData.name.trim()}
                className="flex-1"
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</>
                ) : (
                  'Submit for Review'
                )}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              New tools require platform admin approval before appearing in the global catalog.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
