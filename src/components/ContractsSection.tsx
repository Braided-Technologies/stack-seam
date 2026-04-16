import { useRef, useState } from 'react';
import { useContractFiles, useUploadContract, useDeleteContractFile } from '@/hooks/useStackData';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
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
  term_months?: number | null;
  billing_cycle?: string | null;
  license_count?: number | null;
  notes?: string | null;
  line_items?: LineItem[];
}

export default function ContractsSection({ userApplicationId, isAdmin, onExtractedData }: ContractsSectionProps) {
  const { data: files = [] } = useContractFiles(userApplicationId);
  const uploadContract = useUploadContract();
  const deleteFile = useDeleteContractFile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ExtractedData | null>(null);
  const [showStorageChoice, setShowStorageChoice] = useState<{ filePath: string; fileId: string } | null>(null);

  const [checkedFields, setCheckedFields] = useState<Record<string, boolean>>({});
  const [checkedLineItems, setCheckedLineItems] = useState<Record<number, boolean>>({});
  const [editableFields, setEditableFields] = useState<Record<string, any>>({});
  const [editableLineItems, setEditableLineItems] = useState<LineItem[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<{ path: string; name: string } | null>(null);

  const togglePreview = async (filePath: string, fileName: string) => {
    if (previewFile?.path === filePath) {
      setPreviewUrl(null);
      setPreviewFile(null);
      return;
    }
    const { data } = await supabase.storage.from('contracts').createSignedUrl(filePath, 300);
    if (data?.signedUrl) {
      setPreviewUrl(data.signedUrl);
      setPreviewFile({ path: filePath, name: fileName });
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
    setCheckedFields({});
    setCheckedLineItems({});
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
      const fields: Record<string, boolean> = {};
      const editable: Record<string, any> = {};
      const fieldKeys = ['vendor_name', 'cost_monthly', 'cost_annual', 'renewal_date', 'term_months', 'billing_cycle', 'license_count', 'notes'];
      for (const key of fieldKeys) {
        const value = (extracted as any)[key];
        if (value != null && value !== '') {
          fields[key] = true;
          editable[key] = value;
        }
      }
      setCheckedFields(fields);
      setEditableFields(editable);
      const liChecks: Record<number, boolean> = {};
      const liEditable = (extracted.line_items || []).map((item, i) => {
        liChecks[i] = false;
        return { ...item };
      });
      setCheckedLineItems(liChecks);
      setEditableLineItems(liEditable);
      toast({ title: 'Document scanned', description: 'Data extracted. Review, edit, and import below.' });
      // Auto-open preview so user can cross-reference extracted data with source
      if (!delete_after_scan) togglePreview(filePath, filePath.split('/').pop() || 'document');
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
    if (checkedFields.vendor_name && editableFields.vendor_name) data.vendor_name = editableFields.vendor_name;
    if (checkedFields.cost_monthly && editableFields.cost_monthly != null) data.cost_monthly = Number(editableFields.cost_monthly);
    if (checkedFields.cost_annual && editableFields.cost_annual != null) data.cost_annual = Number(editableFields.cost_annual);
    if (checkedFields.renewal_date && editableFields.renewal_date) data.renewal_date = editableFields.renewal_date;
    if (checkedFields.term_months && editableFields.term_months != null) data.term_months = Number(editableFields.term_months);
    if (checkedFields.billing_cycle && editableFields.billing_cycle) data.billing_cycle = editableFields.billing_cycle;
    if (checkedFields.license_count && editableFields.license_count != null) data.license_count = Number(editableFields.license_count);
    if (checkedFields.notes && editableFields.notes) data.notes = editableFields.notes;

    const selectedItems = editableLineItems.filter((_, i) => checkedLineItems[i]);
    if (selectedItems.length > 0) {
      const liMonthly = selectedItems.reduce((sum, li) => sum + (Number(li.monthly_cost) || 0), 0);
      const liAnnual = selectedItems.reduce((sum, li) => sum + (Number(li.annual_cost) || 0), 0);
      if (liMonthly > 0) data.cost_monthly = liMonthly;
      if (liAnnual > 0) data.cost_annual = liAnnual;
      data.selected_line_items = selectedItems;
    }

    onExtractedData?.(data);
    toast({ title: 'Data imported', description: 'Selected fields have been applied.' });
    setScanResult(null);
  };

  const toggleField = (field: string) => {
    setCheckedFields(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const toggleLineItem = (index: number) => {
    setCheckedLineItems(prev => {
      const next = { ...prev, [index]: !prev[index] };
      const selectedItems = editableLineItems.filter((_, i) => next[i]);
      if (selectedItems.length > 0) {
        const sumMonthly = selectedItems.reduce((sum, li) => sum + (Number(li.monthly_cost) || 0), 0);
        const sumAnnual = selectedItems.reduce((sum, li) => sum + (Number(li.annual_cost) || 0), 0);
        setEditableFields(ef => ({
          ...ef,
          ...(sumMonthly > 0 ? { cost_monthly: sumMonthly } : {}),
          ...(sumAnnual > 0 ? { cost_annual: sumAnnual } : {}),
        }));
        if (sumMonthly > 0) setCheckedFields(cf => ({ ...cf, cost_monthly: true }));
        if (sumAnnual > 0) setCheckedFields(cf => ({ ...cf, cost_annual: true }));
      }
      return next;
    });
  };

  const toggleUnlimitedQty = (index: number) => {
    setEditableLineItems(prev => prev.map((item, i) =>
      i === index ? { ...item, unlimited_qty: !item.unlimited_qty, quantity: !item.unlimited_qty ? null : item.quantity } : item
    ));
  };

  const updateField = (key: string, value: any) => {
    setEditableFields(prev => ({ ...prev, [key]: value }));
  };

  const updateLineItem = (index: number, key: keyof LineItem, value: any) => {
    setEditableLineItems(prev => prev.map((item, i) => i === index ? { ...item, [key]: value } : item));
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const FIELD_LABELS: Record<string, string> = {
    vendor_name: 'Vendor',
    cost_monthly: 'Monthly Cost',
    cost_annual: 'Annual Cost',
    renewal_date: 'Renewal Date',
    term_months: 'Term (months)',
    billing_cycle: 'Billing Cycle',
    license_count: 'Licenses',
    notes: 'Notes',
  };

  const FIELD_TYPES: Record<string, string> = {
    vendor_name: 'text',
    cost_monthly: 'number',
    cost_annual: 'number',
    renewal_date: 'date',
    term_months: 'number',
    billing_cycle: 'text',
    license_count: 'number',
    notes: 'text',
  };

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

      {/* Inline document preview */}
      {previewUrl && previewFile && (
        <div className="rounded-lg border overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b">
            <span className="text-xs font-medium truncate">{previewFile.name}</span>
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setPreviewUrl(null); setPreviewFile(null); }}>
              Close
            </Button>
          </div>
          {isPdf(previewFile.name) ? (
            <iframe src={previewUrl} className="w-full border-0" style={{ height: '350px' }} title="Document preview" />
          ) : isImage(previewFile.name) ? (
            <img src={previewUrl} alt="Document preview" className="w-full max-h-[350px] object-contain bg-black/5" />
          ) : (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Preview not available for this file type.{' '}
              <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Open in new tab</a>
            </div>
          )}
        </div>
      )}

      {scanResult && (
        <div className="rounded-lg border bg-muted/30 flex flex-col" style={{ maxHeight: '60vh' }}>
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-3 text-sm space-y-3">
              <p className="font-medium text-xs uppercase tracking-wider text-muted-foreground">Extracted Data — Edit & select fields to import</p>
              
              <div className="space-y-2">
                {Object.entries(FIELD_LABELS).map(([key, label]) => {
                  if (editableFields[key] == null && !checkedFields[key]) return null;
                  const displayValue = (key === 'cost_monthly' || key === 'cost_annual') && editableFields[key]
                    ? formatNumber(Number(editableFields[key]))
                    : undefined;
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <Checkbox checked={!!checkedFields[key]} onCheckedChange={() => toggleField(key)} />
                      <span className="font-medium text-xs w-24 shrink-0">{label}:</span>
                      {key === 'billing_cycle' ? (
                        <Select value={editableFields[key] || ''} onValueChange={v => updateField(key, v)}>
                          <SelectTrigger className="h-7 text-xs flex-1">
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="annual">Annual</SelectItem>
                            <SelectItem value="quarterly">Quarterly</SelectItem>
                            <SelectItem value="multi-year">Multi-Year</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type={FIELD_TYPES[key] || 'text'}
                          value={editableFields[key] ?? ''}
                          onChange={e => updateField(key, e.target.value)}
                          className="h-7 text-xs flex-1"
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {editableLineItems.length > 0 && (
                <div className="space-y-1.5">
                  <p className="font-medium text-xs uppercase tracking-wider text-muted-foreground mt-2">
                    Line Items ({editableLineItems.length}) — Select items relevant to this app
                  </p>
                  {editableLineItems.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 rounded px-1 py-1 border border-border/50 bg-background/50">
                      <Checkbox checked={!!checkedLineItems[i]} onCheckedChange={() => toggleLineItem(i)} className="mt-1.5" />
                      <div className="flex-1 min-w-0 space-y-1">
                        <Input
                          value={item.name}
                          onChange={e => updateLineItem(i, 'name', e.target.value)}
                          className="h-7 text-xs font-medium"
                          placeholder="Product name"
                        />
                        <div className="grid grid-cols-3 gap-1">
                          <Input
                            type="number"
                            value={item.monthly_cost ?? ''}
                            onChange={e => updateLineItem(i, 'monthly_cost', e.target.value ? Number(e.target.value) : null)}
                            className="h-6 text-xs"
                            placeholder="$/mo"
                          />
                          <Input
                            type="number"
                            value={item.annual_cost ?? ''}
                            onChange={e => updateLineItem(i, 'annual_cost', e.target.value ? Number(e.target.value) : null)}
                            className="h-6 text-xs"
                            placeholder="$/yr"
                          />
                          <div className="flex items-center gap-1">
                            {item.unlimited_qty ? (
                              <span className="text-xs text-muted-foreground flex-1 text-center">∞</span>
                            ) : (
                              <Input
                                type="number"
                                value={item.quantity ?? ''}
                                onChange={e => updateLineItem(i, 'quantity', e.target.value ? Number(e.target.value) : null)}
                                className="h-6 text-xs flex-1"
                                placeholder="Qty"
                              />
                            )}
                            <button
                              type="button"
                              className={`text-[10px] px-1 rounded border ${item.unlimited_qty ? 'bg-primary/20 border-primary/50 text-primary' : 'border-border text-muted-foreground hover:bg-accent'}`}
                              onClick={() => toggleUnlimitedQty(i)}
                              title="Toggle unlimited"
                            >
                              ∞
                            </button>
                          </div>
                        </div>
                        {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
          <div className="flex gap-2 p-3 border-t bg-muted/30 shrink-0">
            <Button size="sm" className="gap-1" onClick={handleImport}>
              <Check className="h-3.5 w-3.5" />
              Import Selected
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setScanResult(null)}>
              Dismiss
            </Button>
          </div>
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
