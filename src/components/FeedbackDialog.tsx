import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { MessageSquare, Send } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

export default function FeedbackDialog({ isExpanded = true, externalOpen, onExternalOpenChange }: { isExpanded?: boolean; externalOpen?: boolean; onExternalOpenChange?: (open: boolean) => void }) {
  const { user, orgId } = useAuth();
  const queryClient = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = onExternalOpenChange || setInternalOpen;
  const [type, setType] = useState('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
    enabled: !!user && open,
  });

  const handleSubmit = async () => {
    if (!title.trim() || !user) return;
    setSubmitting(true);
    const { error } = await supabase.from('feedback').insert({
      user_id: user.id,
      organization_id: orgId,
      type,
      title: title.trim(),
      description: description.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Feedback submitted', description: 'Thank you! We\'ll review this shortly.' });
    setTitle('');
    setDescription('');
    setType('bug');
    queryClient.invalidateQueries({ queryKey: ['my-feedback'] });
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('w-full gap-2 text-muted-foreground', isExpanded ? 'justify-start' : 'justify-center px-0')}
          title="Feedback"
        >
          <MessageSquare className="h-4 w-4 flex-shrink-0" />
          {isExpanded && <span className="whitespace-nowrap">Feedback</span>}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Feedback & Support</DialogTitle>
          <DialogDescription>Submit a bug report, feature idea, or question</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="submit">
          <TabsList className="w-full">
            <TabsTrigger value="submit" className="flex-1">Submit</TabsTrigger>
            <TabsTrigger value="history" className="flex-1">My Submissions ({myFeedback.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="submit" className="space-y-4 mt-4">
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
            <Button onClick={handleSubmit} disabled={!title.trim() || submitting} className="w-full">
              <Send className="h-4 w-4 mr-2" /> Submit Feedback
            </Button>
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            {myFeedback.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No submissions yet</p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {myFeedback.map((fb: any) => (
                  <div key={fb.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={statusColor(fb.status) as any}>{fb.status.replace('_', ' ')}</Badge>
                      <Badge variant="outline">{fb.type}</Badge>
                      <span className="text-xs text-muted-foreground ml-auto">{new Date(fb.created_at).toLocaleDateString()}</span>
                    </div>
                    <p className="font-medium text-sm">{fb.title}</p>
                    {fb.description && <p className="text-xs text-muted-foreground">{fb.description}</p>}
                    {fb.admin_response && (
                      <div className="bg-muted rounded-md p-2 text-xs">
                        <span className="font-medium">Response:</span> {fb.admin_response}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
