import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { Layers } from 'lucide-react';

export default function Auth() {
  const { user, loading, orgId } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { signIn, signUp } = useAuth();

  if (loading) return null;
  if (user && orgId) return <Navigate to="/" replace />;
  if (user && !orgId) return <Navigate to="/setup" replace />;

  const handleSubmit = async (mode: 'login' | 'signup') => {
    setSubmitting(true);
    const fn = mode === 'login' ? signIn : signUp;
    const { error } = await fn(email, password);
    setSubmitting(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else if (mode === 'signup') {
      toast({ title: 'Check your email', description: 'We sent you a confirmation link.' });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Layers className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">StackMap</CardTitle>
          <CardDescription>IT Stack Intelligence Portal</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Log In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            <TabsContent value="login" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input id="login-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input id="login-password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              <Button className="w-full" disabled={submitting} onClick={() => handleSubmit('login')}>
                {submitting ? 'Signing in...' : 'Sign In'}
              </Button>
            </TabsContent>
            <TabsContent value="signup" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input id="signup-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <Input id="signup-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" />
              </div>
              <Button className="w-full" disabled={submitting} onClick={() => handleSubmit('signup')}>
                {submitting ? 'Creating account...' : 'Create Account'}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
