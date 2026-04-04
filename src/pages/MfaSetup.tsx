import { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { ShieldCheck, Loader2 } from 'lucide-react';

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
    (async () => {
      // Check if already enrolled
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.find(f => f.status === 'verified');
      if (totp) {
        navigate('/', { replace: true });
        return;
      }

      // Unenroll any unverified factors first
      const unverified = factors?.totp?.filter(f => f.status !== 'verified') || [];
      for (const f of unverified) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }

      // Enroll new factor (no friendlyName to avoid name conflict errors)
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        setEnrolling(false);
        return;
      }
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactorId(data.id);
      setEnrolling(false);
    })();
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
                  <code className="text-sm font-mono bg-muted px-3 py-1 rounded select-all">{secret}</code>
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
