import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Building2 } from 'lucide-react';

export default function OrgSetup() {
  const { user, loading, orgId, createOrg } = useAuth();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (orgId) return <Navigate to="/" replace />;

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    const { error } = await createOrg(name.trim());
    setSubmitting(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Building2 className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-xl">Set Up Your Organization</CardTitle>
          <CardDescription>Create your team workspace to start building your stack</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">Organization Name</Label>
            <Input id="org-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Acme MSP" />
          </div>
          <Button className="w-full" disabled={submitting || !name.trim()} onClick={handleCreate}>
            {submitting ? 'Creating...' : 'Create Organization'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
