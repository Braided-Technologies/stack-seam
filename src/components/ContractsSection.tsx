import { useRef } from 'react';
import { useContractFiles, useUploadContract, useDeleteContractFile } from '@/hooks/useStackData';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Upload, FileText, Trash2, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ContractsSectionProps {
  userApplicationId: string;
  isAdmin: boolean;
}

export default function ContractsSection({ userApplicationId, isAdmin }: ContractsSectionProps) {
  const { data: files = [] } = useContractFiles(userApplicationId);
  const uploadContract = useUploadContract();
  const deleteFile = useDeleteContractFile();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    </div>
  );
}
