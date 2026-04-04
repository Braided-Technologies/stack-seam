import { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { ShieldCheck, Loader2 } from 'lucide-react';

type PendingEnrollment = {
  qrCode: string;
  secret: string;
  factorId: string;
};

let pendingEnrollmentPromise: Promise<PendingEnrollment | null> | null = null;
let pendingEnrollmentCache: PendingEnrollment | null = null;

const getOrCreatePendingEnrollment = async (): Promise<PendingEnrollment | null> => {
  if (pendingEnrollmentCache) return pendingEnrollmentCache;

  if (!pendingEnrollmentPromise) {
    pendingEnrollmentPromise = (async () => {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verifiedFactor = factors?.totp?.find((factor) => factor.status === 'verified');
      if (verifiedFactor) return null;

      const unverifiedFactors = factors?.totp?.filter((factor) => factor.status !== 'verified') || [];
      for (const factor of unverifiedFactors) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }

      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;

      const enrollment = {
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
        factorId: data.id,
      };

      pendingEnrollmentCache = enrollment;
      return enrollment;
    })().finally(() => {
      pendingEnrollmentPromise = null;
    });
  }

  return pendingEnrollmentPromise;
};

const clearPendingEnrollment = () => {
  pendingEnrollmentCache = null;
  pendingEnrollmentPromise = null;
};

export default function MfaSetup() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [enrolling, setEnrolling] = useState(true);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    (async () => {
      try {
        const enrollment = await getOrCreatePendingEnrollment();
        if (cancelled) return;

        if (!enrollment) {
          navigate('/', { replace: true });
          return;
        }

        setQrCode(enrollment.qrCode);
        setSecret(enrollment.secret);
        setFactorId(enrollment.factorId);
      } catch (error) {
        if (!cancelled) {
          toast({
            title: 'Error',
            description: error instanceof Error ? error.message : 'Unable to start MFA setup.',
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setEnrolling(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, navigate]);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const handleVerify = async () => {
    if (!factorId || verifyCode.length !== 6) return;
    setVerifying(true);
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) {
      toast({ title: 'Error', description: challengeError.message, variant: 'destructive' });
      setVerifying(false);
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: verifyCode });
    if (verifyError) {
      toast({ title: 'Invalid code', description: 'Please check your authenticator app and try again.', variant: 'destructive' });
      setVerifying(false);
      return;
    }
    clearPendingEnrollment();
    toast({ title: 'MFA Enabled', description: 'Your account is now protected with two-factor authentication.' });
    navigate('/', { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <ShieldCheck className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-xl font-display">Set Up Two-Factor Authentication</CardTitle>
          <CardDescription>
            Scan the QR code below with your authenticator app (Google Authenticator, Authy, etc.)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {enrolling ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {qrCode && (
                <div className="flex justify-center">
                  <img src={qrCode} alt="MFA QR Code" className="h-48 w-48 rounded-lg border" />
                </div>
              )}
              {secret && (
                <div className="space-y-1 text-center">
                  <p className="text-xs text-muted-foreground">Can't scan? Enter this key manually:</p>
                  <code className="rounded bg-muted px-3 py-1 text-sm font-mono select-all">{secret}</code>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="mfa-code">Enter 6-digit code from your app</label>
                <input
                  id="mfa-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={verifyCode}
                  onChange={e => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-center text-2xl font-mono tracking-[0.5em] ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="000000"
                />
              </div>
              <Button className="w-full" disabled={verifying || verifyCode.length !== 6} onClick={handleVerify}>
                {verifying ? 'Verifying...' : 'Verify & Enable MFA'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

