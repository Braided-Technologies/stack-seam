import { useRef, useState } from 'react';
import { useContractFiles, useUploadContract, useDeleteContractFile } from '@/hooks/useStackData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import { TermBillingFields } from '@/components/TermBillingFields';
import { applyCostRatio } from '@/lib/costs';
import { Upload, FileText, Trash2, Download, ScanSearch, Loader2, Check, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatNumber } from '@/lib/formatters';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ContractsSectionProps {
  userApplicationId: string;
  isAdmin: boolean;
  onExtractedData?: (data: any) => void;
  onPreviewChange?: (active: boolean) => void;
}

interface LineItem {
  name: string;
  quantity?: number | null;
  monthly_cost?: number | null;
  annual_cost?: number | null;
  unit_price?: number | null;
  description?: string | null;
  unlimited_qty?: boolean;
}

interface ExtractedData {
  vendor_name?: string;
  cost_monthly?: number | null;
  cost_annual?: number | null;
  renewal_date?: string | null;
  start_date?: string | null;
  term_months?: number | null;
  billing_cycle?: string | null;
  license_count?: number | null;
  notes?: string | null;
  line_items?: LineItem[];
}

export default function ContractsSection({ userApplicationId, isAdmin, onExtractedData, onPreviewChange }: ContractsSectionProps) {
  const { data: files = [] } = useContractFiles(userApplicationId);
  const uploadContract = useUploadContract();
  const deleteFile = useDeleteContractFile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ExtractedData | null>(null);
  const [showStorageChoice, setShowStorageChoice] = useState<{ filePath: string; fileId: string } | null>(null);

  const [editableFields, setEditableFields] = useState<Record<string, any>>({});
  const [editableLineItems, setEditableLineItems] = useState<LineItem[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<{ path: string; name: string } | null>(null);

  const togglePreview = async (filePath: string, fileName: string) => {
    if (previewFile?.path === filePath) {
      setPreviewUrl(null);
      setPreviewFile(null);
      onPreviewChange?.(false);
      return;
    }
    const { data } = await supabase.storage.from('contracts').createSignedUrl(filePath, 300);
    if (data?.signedUrl) {
      setPreviewUrl(data.signedUrl);
      setPreviewFile({ path: filePath, name: fileName });
      onPreviewChange?.(true);
    }
  };

  const isImage = (fileName: string) => /\.(jpg|jpeg|png|webp|heic|gif)$/i.test(fileName);
  const isPdf = (fileName: string) => /\.pdf$/i.test(fileName);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: 'Error', description: 'File must be under 20MB', variant: 'destructive' });
      return;
    }
    try {
      const result = await uploadContract.mutateAsync({ file, userApplicationId });
      toast({ title: 'Contract uploaded' });
      if (result) {
        setShowStorageChoice({ filePath: result.file_path, fileId: result.id });
      }
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownload = async (filePath: string, fileName: string) => {
    const { data, error } = await supabase.storage.from('contracts').download(filePath);
    if (error) {
      toast({ title: 'Download failed', description: error.message, variant: 'destructive' });
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (id: string, filePath: string) => {
    try {
      await deleteFile.mutateAsync({ id, filePath, userApplicationId });
      toast({ title: 'Contract deleted' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleScan = async (filePath: string, fileId: string, deleteAfterScan: boolean) => {
    setScanning(fileId);
    setShowStorageChoice(null);
    setScanResult(null);
    setEditableFields({});
    setEditableLineItems([]);
    try {
      const { data, error } = await supabase.functions.invoke('scan-contract', {
        body: { file_path: filePath, user_application_id: userApplicationId, delete_after_scan: deleteAfterScan },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const extracted: ExtractedData = data.extracted || {};
      setScanResult(extracted);
      const editable: Record<string, any> = {};
      const fieldKeys = ['vendor_name', 'cost_monthly', 'cost_annual', 'renewal_date', 'start_date', 'term_months', 'billing_cycle', 'license_count', 'notes'];
      for (const key of fieldKeys) {
        const value = (extracted as any)[key];
        if (value != null && value !== '') editable[key] = value;
      }
      const lineItems = (extracted.line_items || []).map(item => ({ ...item }));
      // Auto-sum line items into top-level costs when they'd otherwise be missing
      // (covers tiered pricing — e.g. "First 3 seats" + "4 and above" — without making the user pick)
      if (lineItems.length > 0) {
        const sumMonthly = lineItems.reduce((s, li) => s + (Number(li.monthly_cost) || 0), 0);
        const sumAnnual = lineItems.reduce((s, li) => s + (Number(li.annual_cost) || 0), 0);
        if (sumMonthly > 0 && !editable.cost_monthly) editable.cost_monthly = sumMonthly;
        if (sumAnnual > 0 && !editable.cost_annual) editable.cost_annual = sumAnnual;
      }
      setEditableFields(editable);
      setEditableLineItems(lineItems);
      toast({ title: 'Document scanned', description: 'Review and edit extracted data below, then import.' });
      // Auto-open preview so user can cross-reference extracted data with source
      if (!deleteAfterScan) togglePreview(filePath, filePath.split('/').pop() || 'document');
    } catch (err: any) {
      toast({ title: 'Scan failed', description: err.message, variant: 'destructive' });
    }
    setScanning(null);
  };

  // For existing files (already saved), skip the dialog and scan directly
  const handleScanExisting = (filePath: string, fileId: string) => {
    handleScan(filePath, fileId, false);
  };

  const handleImport = () => {
    if (!scanResult) return;
    const data: any = {};
    const numericKeys = new Set(['cost_monthly', 'cost_annual', 'term_months', 'license_count']);
    for (const [key, value] of Object.entries(editableFields)) {
      if (value == null || value === '') continue;
      data[key] = numericKeys.has(key) ? Number(value) : value;
    }
    // Enforce 12x ratio on import: if only one of monthly/annual is set, fill the other.
    // (User shouldn't have to trigger it by manually typing after importing.)
    const m = Number(data.cost_monthly) || 0;
    const a = Number(data.cost_annual) || 0;
    if (m > 0 && !(a > 0)) data.cost_annual = Math.round(m * 12 * 100) / 100;
    else if (a > 0 && !(m > 0)) data.cost_monthly = Math.round((a / 12) * 100) / 100;

    if (editableLineItems.length > 0) data.line_items = editableLineItems;

    onExtractedData?.(data);
    setScanResult(null);
  };

  const updateField = (key: string, value: any) => {
    setEditableFields(prev => ({ ...prev, [key]: value }));
  };

  const applyTermBillingPatch = (patch: { term_months?: number | null; billing_cycle?: string | null; start_date?: string | null; renewal_date?: string | null }) => {
    setEditableFields(prev => ({ ...prev, ...patch }));
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  // Term, billing cycle, start date, and renewal date are handled by <TermBillingFields /> below — not rendered here.
  const SIMPLE_FIELDS: { key: string; label: string; type: string }[] = [
    { key: 'vendor_name', label: 'Vendor', type: 'text' },
    { key: 'cost_monthly', label: 'Monthly Cost', type: 'number' },
    { key: 'cost_annual', label: 'Annual Cost', type: 'number' },
    { key: 'license_count', label: 'Licenses', type: 'number' },
    { key: 'notes', label: 'Notes', type: 'text' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Documents</p>
        {isAdmin && (
          <>
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadContract.isPending}>
              <Upload className="h-3.5 w-3.5 mr-1" />
              {uploadContract.isPending ? 'Uploading...' : 'Upload'}
            </Button>
            <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.heic,.webp" className="hidden" onChange={handleUpload} />
          </>
        )}
      </div>

      {files.map(f => (
        <div key={f.id} className="flex items-center justify-between rounded-lg border p-3">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{f.file_name}</p>
              <p className="text-xs text-muted-foreground">{formatSize(f.file_size)}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className={`h-7 w-7 ${previewFile?.path === f.file_path ? 'text-primary' : ''}`}
              title={previewFile?.path === f.file_path ? 'Hide preview' : 'Preview document'}
              onClick={() => togglePreview(f.file_path, f.file_name)}
            >
              {previewFile?.path === f.file_path ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
            {isAdmin && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Scan & Extract Data"
                disabled={scanning === f.id}
                onClick={() => handleScanExisting(f.file_path, f.id)}
              >
                {scanning === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDownload(f.file_path, f.file_name)}>
              <Download className="h-3.5 w-3.5" />
            </Button>
            {isAdmin && (
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(f.id, f.file_path)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      ))}

      {files.length === 0 && (
        <p className="text-xs text-muted-foreground">No documents uploaded yet.</p>
      )}

      {/* Side-by-side: extracted data (left) + document preview (right) */}
      {(scanResult || (previewUrl && previewFile)) && (
        <div className="flex gap-3" style={{ maxHeight: '60vh' }}>

        {/* Preview panel — right side when scan results visible, standalone otherwise */}
        {previewUrl && previewFile && (
          <div className={`rounded-lg border overflow-hidden flex flex-col ${scanResult ? 'w-1/2 shrink-0' : 'w-full'}`}>
            <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b shrink-0">
              <span className="text-xs font-medium truncate">{previewFile.name}</span>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setPreviewUrl(null); setPreviewFile(null); onPreviewChange?.(false); }}>
                Close
              </Button>
            </div>
            {isPdf(previewFile.name) ? (
              <iframe src={previewUrl} className="w-full flex-1 border-0 min-h-[300px]" title="Document preview" />
            ) : isImage(previewFile.name) ? (
              <img src={previewUrl} alt="Document preview" className="w-full flex-1 object-contain bg-black/5 min-h-[200px]" />
            ) : (
              <div className="p-4 text-center text-sm text-muted-foreground flex-1 flex items-center justify-center">
                <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Open in new tab</a>
              </div>
            )}
          </div>
        )}

      {scanResult && (
        <div className={`rounded-lg border bg-muted/30 flex flex-col ${previewUrl ? 'w-1/2' : 'w-full'}`} style={{ maxHeight: '60vh' }}>
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-3 text-sm space-y-3">
              <p className="font-medium text-xs uppercase tracking-wider text-muted-foreground">Extracted Data — Review & edit before importing</p>

              <div className="space-y-2">
                {SIMPLE_FIELDS.map(({ key, label, type }) => {
                  if (editableFields[key] == null) return null;
                  const isNotes = key === 'notes';
                  return (
                    <div key={key} className="flex items-start gap-2">
                      <span className="font-medium text-xs w-24 shrink-0 pt-1.5">{label}:</span>
                      {isNotes ? (
                        <textarea
                          value={editableFields[key] ?? ''}
                          onChange={e => updateField(key, e.target.value)}
                          className="flex-1 min-h-[48px] text-xs rounded-md border border-input bg-background px-2 py-1"
                        />
                      ) : (
                        <Input
                          type={type}
                          value={editableFields[key] ?? ''}
                          onChange={e => {
                            if (key === 'cost_monthly' || key === 'cost_annual') {
                              setEditableFields(prev => ({ ...prev, ...applyCostRatio(key, e.target.value) }));
                            } else {
                              updateField(key, e.target.value);
                            }
                          }}
                          className="h-7 text-xs flex-1"
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="pt-1">
                <TermBillingFields
                  termMonths={editableFields.term_months ?? null}
                  billingCycle={editableFields.billing_cycle ?? null}
                  startDate={editableFields.start_date ?? null}
                  renewalDate={editableFields.renewal_date ?? null}
                  onChange={applyTermBillingPatch}
                  compact
                />
              </div>

              {editableLineItems.length > 0 && (
                <details className="rounded border border-border/50 bg-background/50 px-2 py-1">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none">
                    Show line items ({editableLineItems.length})
                  </summary>
                  <div className="mt-2 space-y-1.5">
                    <p className="text-[11px] text-muted-foreground italic">
                      Line items are rolled up into the totals above. Adjust Monthly/Annual Cost directly if the sum looks off.
                    </p>
                    {editableLineItems.map((item, i) => (
                      <div key={i} className="rounded border border-border/40 px-2 py-1.5 text-xs">
                        <p className="font-medium truncate">{item.name}</p>
                        <div className="flex gap-3 text-muted-foreground mt-0.5">
                          {item.monthly_cost != null && <span>{formatNumber(Number(item.monthly_cost))} / mo</span>}
                          {item.annual_cost != null && <span>{formatNumber(Number(item.annual_cost))} / yr</span>}
                          {item.quantity != null && <span>qty {item.quantity}</span>}
                          {item.unlimited_qty && <span>qty ∞</span>}
                        </div>
                        {item.description && <p className="text-[11px] text-muted-foreground mt-0.5">{item.description}</p>}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </ScrollArea>
          <div className="flex gap-2 p-3 border-t bg-muted/30 shrink-0">
            <Button size="sm" className="gap-1" onClick={handleImport}>
              <Check className="h-3.5 w-3.5" />
              Import
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setScanResult(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      </div>
      )}

      {/* Storage choice dialog — only shown for newly uploaded files */}
      <AlertDialog open={!!showStorageChoice} onOpenChange={() => setShowStorageChoice(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Scan Contract?</AlertDialogTitle>
            <AlertDialogDescription>
              Use AI to extract cost, renewal, and term data from this contract. You can also choose what happens to the file afterward.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Skip (Keep File Only)</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => showStorageChoice && handleScan(showStorageChoice.filePath, showStorageChoice.fileId, false)}
            >
              Scan & Keep File
            </AlertDialogAction>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => showStorageChoice && handleScan(showStorageChoice.filePath, showStorageChoice.fileId, true)}
            >
              Scan & Delete File
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
