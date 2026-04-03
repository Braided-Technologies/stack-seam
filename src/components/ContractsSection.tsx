import { useRef, useState } from 'react';
import { useContractFiles, useUploadContract, useDeleteContractFile } from '@/hooks/useStackData';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Upload, FileText, Trash2, Download, ScanSearch, Loader2 } from 'lucide-react';
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

export default function ContractsSection({ userApplicationId, isAdmin, onExtractedData }: ContractsSectionProps) {
  const { data: files = [] } = useContractFiles(userApplicationId);
  const uploadContract = useUploadContract();
  const deleteFile = useDeleteContractFile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<any>(null);
  const [showStorageChoice, setShowStorageChoice] = useState<{ filePath: string; fileId: string } | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: 'Error', description: 'File must be under 20MB', variant: 'destructive' });
      return;
    }
    try {
      await uploadContract.mutateAsync({ file, userApplicationId });
      toast({ title: 'Contract uploaded' });
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
    try {
      const { data, error } = await supabase.functions.invoke('scan-contract', {
        body: { file_path: filePath, user_application_id: userApplicationId, delete_after_scan: deleteAfterScan },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setScanResult(data.extracted);
      onExtractedData?.(data.extracted);
      toast({
        title: 'Contract scanned',
        description: deleteAfterScan
          ? 'Data extracted and file removed.'
          : 'Data extracted. File kept in storage.',
      });
    } catch (err: any) {
      toast({ title: 'Scan failed', description: err.message, variant: 'destructive' });
    }
    setScanning(null);
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
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

      {scanResult && (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
          <p className="font-medium text-xs uppercase tracking-wider text-muted-foreground mb-2">Extracted Data</p>
          {scanResult.vendor_name && <p><strong>Vendor:</strong> {scanResult.vendor_name}</p>}
          {scanResult.cost_monthly != null && <p><strong>Monthly Cost:</strong> ${scanResult.cost_monthly}</p>}
          {scanResult.cost_annual != null && <p><strong>Annual Cost:</strong> ${scanResult.cost_annual}</p>}
          {scanResult.renewal_date && <p><strong>Renewal:</strong> {scanResult.renewal_date}</p>}
          {scanResult.term_months != null && <p><strong>Term:</strong> {scanResult.term_months} months</p>}
          {scanResult.billing_cycle && <p><strong>Billing:</strong> {scanResult.billing_cycle}</p>}
          {scanResult.license_count != null && <p><strong>Licenses:</strong> {scanResult.license_count}</p>}
          {scanResult.notes && <p><strong>Notes:</strong> {scanResult.notes}</p>}
        </div>
      )}

      {/* Storage choice dialog */}
      <AlertDialog open={!!showStorageChoice} onOpenChange={() => setShowStorageChoice(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Scan Contract</AlertDialogTitle>
            <AlertDialogDescription>
              Extract cost, renewal, and term data from this contract using AI. What should happen to the file after scanning?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
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
