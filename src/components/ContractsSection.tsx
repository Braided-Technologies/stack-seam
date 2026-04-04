import { useRef, useState } from 'react';
import { useContractFiles, useUploadContract, useDeleteContractFile } from '@/hooks/useStackData';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';
import { Upload, FileText, Trash2, Download, ScanSearch, Loader2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
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
  monthly_cost?: number | null;
  annual_cost?: number | null;
  description?: string | null;
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

  // Checkboxes for extracted fields
  const [checkedFields, setCheckedFields] = useState<Record<string, boolean>>({});
  const [checkedLineItems, setCheckedLineItems] = useState<Record<number, boolean>>({});

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
    try {
      const { data, error } = await supabase.functions.invoke('scan-contract', {
        body: { file_path: filePath, user_application_id: userApplicationId, delete_after_scan: deleteAfterScan },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const extracted: ExtractedData = data.extracted || {};
      setScanResult(extracted);
      // Default all fields to checked
      const fields: Record<string, boolean> = {};
      if (extracted.vendor_name) fields.vendor_name = true;
      if (extracted.cost_monthly != null) fields.cost_monthly = true;
      if (extracted.cost_annual != null) fields.cost_annual = true;
      if (extracted.renewal_date) fields.renewal_date = true;
      if (extracted.term_months != null) fields.term_months = true;
      if (extracted.billing_cycle) fields.billing_cycle = true;
      if (extracted.license_count != null) fields.license_count = true;
      if (extracted.notes) fields.notes = true;
      setCheckedFields(fields);
      // Default line items to unchecked so user picks relevant ones
      const liChecks: Record<number, boolean> = {};
      (extracted.line_items || []).forEach((_, i) => { liChecks[i] = false; });
      setCheckedLineItems(liChecks);
      toast({
        title: 'Contract scanned',
        description: deleteAfterScan
          ? 'Data extracted. Review and import below.'
          : 'Data extracted. Review and import below.',
      });
    } catch (err: any) {
      toast({ title: 'Scan failed', description: err.message, variant: 'destructive' });
    }
    setScanning(null);
  };

  const handleImport = () => {
    if (!scanResult) return;
    const data: any = {};
    if (checkedFields.vendor_name && scanResult.vendor_name) data.vendor_name = scanResult.vendor_name;
    if (checkedFields.cost_monthly && scanResult.cost_monthly != null) data.cost_monthly = scanResult.cost_monthly;
    if (checkedFields.cost_annual && scanResult.cost_annual != null) data.cost_annual = scanResult.cost_annual;
    if (checkedFields.renewal_date && scanResult.renewal_date) data.renewal_date = scanResult.renewal_date;
    if (checkedFields.term_months && scanResult.term_months != null) data.term_months = scanResult.term_months;
    if (checkedFields.billing_cycle && scanResult.billing_cycle) data.billing_cycle = scanResult.billing_cycle;
    if (checkedFields.license_count && scanResult.license_count != null) data.license_count = scanResult.license_count;
    if (checkedFields.notes && scanResult.notes) data.notes = scanResult.notes;

    // Aggregate costs from selected line items
    const selectedItems = (scanResult.line_items || []).filter((_, i) => checkedLineItems[i]);
    if (selectedItems.length > 0) {
      const liMonthly = selectedItems.reduce((sum, li) => sum + (li.monthly_cost || 0), 0);
      const liAnnual = selectedItems.reduce((sum, li) => sum + (li.annual_cost || 0), 0);
      if (liMonthly > 0) data.cost_monthly = (data.cost_monthly || 0) + liMonthly;
      if (liAnnual > 0) data.cost_annual = (data.cost_annual || 0) + liAnnual;
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
    setCheckedLineItems(prev => ({ ...prev, [index]: !prev[index] }));
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

  const formatFieldValue = (key: string, value: any) => {
    if (value == null) return '—';
    if (key === 'cost_monthly' || key === 'cost_annual') return `$${value}`;
    if (key === 'term_months') return `${value} months`;
    return String(value);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Contracts</p>
        {isAdmin && (
          <>
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadContract.isPending}>
              <Upload className="h-3.5 w-3.5 mr-1" />
              {uploadContract.isPending ? 'Uploading...' : 'Upload'}
            </Button>
            <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleUpload} />
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
            {isAdmin && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Scan & Extract Data"
                disabled={scanning === f.id}
                onClick={() => setShowStorageChoice({ filePath: f.file_path, fileId: f.id })}
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
        <p className="text-xs text-muted-foreground">No contracts uploaded yet.</p>
      )}

      {/* Extracted data with checkboxes */}
      {scanResult && (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-3">
          <p className="font-medium text-xs uppercase tracking-wider text-muted-foreground">Extracted Data — Select fields to import</p>
          
          {/* Standard fields */}
          <div className="space-y-1.5">
            {Object.entries(FIELD_LABELS).map(([key, label]) => {
              const value = (scanResult as any)[key];
              if (value == null && key !== 'notes') return null;
              if (key === 'notes' && !value) return null;
              return (
                <label key={key} className="flex items-center gap-2 cursor-pointer hover:bg-accent/30 rounded px-1 py-0.5">
                  <Checkbox
                    checked={!!checkedFields[key]}
                    onCheckedChange={() => toggleField(key)}
                  />
                  <span className="font-medium text-xs w-24">{label}:</span>
                  <span className="text-xs">{formatFieldValue(key, value)}</span>
                </label>
              );
            })}
          </div>

          {/* Line items */}
          {scanResult.line_items && scanResult.line_items.length > 0 && (
            <div className="space-y-1.5">
              <p className="font-medium text-xs uppercase tracking-wider text-muted-foreground mt-2">
                Line Items ({scanResult.line_items.length}) — Select items relevant to this app
              </p>
              {scanResult.line_items.map((item, i) => (
                <label key={i} className="flex items-start gap-2 cursor-pointer hover:bg-accent/30 rounded px-1 py-1 border border-border/50 bg-background/50">
                  <Checkbox
                    checked={!!checkedLineItems[i]}
                    onCheckedChange={() => toggleLineItem(i)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">{item.name}</p>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      {item.monthly_cost != null && <span>${item.monthly_cost}/mo</span>}
                      {item.annual_cost != null && <span>${item.annual_cost}/yr</span>}
                    </div>
                    {item.description && <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>}
                  </div>
                </label>
              ))}
            </div>
          )}

          <div className="flex gap-2 pt-1">
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

      {/* Storage choice dialog */}
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
