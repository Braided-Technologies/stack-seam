import { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { ShieldCheck } from 'lucide-react';

export default function MfaVerify() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.find(f => f.status === 'verified');
      if (totp) {
        setFactorId(totp.id);
      } else {
        // No MFA enrolled, redirect to setup
        navigate('/mfa-setup', { replace: true });
      }
    })();
  }, [user, navigate]);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const handleVerify = async () => {
    if (!factorId || code.length !== 6) return;
    setVerifying(true);
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) {
      toast({ title: 'Error', description: challengeError.message, variant: 'destructive' });
      setVerifying(false);
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
    if (verifyError) {
      toast({ title: 'Invalid code', description: 'Please check your authenticator app and try again.', variant: 'destructive' });
      setCode('');
      setVerifying(false);
      return;
    }
    navigate('/', { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <ShieldCheck className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-xl font-display">Two-Factor Authentication</CardTitle>
          <CardDescription>
            Enter the 6-digit code from your authenticator app to continue
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="flex h-14 w-full rounded-md border border-input bg-background px-3 py-2 text-center text-3xl font-mono tracking-[0.5em] ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="000000"
              autoFocus
            />
          </div>
          <Button className="w-full" disabled={verifying || code.length !== 6} onClick={handleVerify}>
            {verifying ? 'Verifying...' : 'Verify'}
          </Button>
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => supabase.auth.signOut()}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
