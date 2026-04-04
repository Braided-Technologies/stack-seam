import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  orgId: string | null;
  orgName: string | null;
  userRole: 'admin' | 'member' | 'platform_admin' | null;
  mfaEnrolled: boolean;
  mfaVerified: boolean;
  aal: any;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  createOrg: (name: string, domain?: string) => Promise<{ error: any }>;
  refreshOrg: () => Promise<void>;
  refreshMfa: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'member' | 'platform_admin' | null>(null);
  const [mfaEnrolled, setMfaEnrolled] = useState(false);
  const [mfaVerified, setMfaVerified] = useState(false);
  const [aal, setAal] = useState<AuthenticatorAssuranceLevels | null>(null);

  const fetchOrg = async (userId: string) => {
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('organization_id, role')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (roleData) {
      setOrgId(roleData.organization_id);
      setUserRole(roleData.role as 'admin' | 'member' | 'platform_admin');
      const { data: orgData } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', roleData.organization_id)
        .single();
      if (orgData) setOrgName(orgData.name);
    } else {
      setOrgId(null);
      setOrgName(null);
      setUserRole(null);
    }
  };

  const checkMfa = async () => {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const hasVerifiedFactor = factors?.totp?.some(f => f.status === 'verified') ?? false;
    setMfaEnrolled(hasVerifiedFactor);

    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setAal(aalData ?? null);
    
    // MFA is verified if current AAL is aal2 OR user has no enrolled factors (hasn't set up MFA yet)
    setMfaVerified(!hasVerifiedFactor || aalData?.currentLevel === 'aal2');
  };

  const refreshMfa = async () => {
    await checkMfa();
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(() => fetchOrg(session.user.id), 0);
        setTimeout(() => checkMfa(), 0);
      } else {
        setOrgId(null);
        setOrgName(null);
        setUserRole(null);
        setMfaEnrolled(false);
        setMfaVerified(false);
        setAal(null);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchOrg(session.user.id);
        checkMfa();
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const createOrg = async (name: string, domain?: string) => {
    const { data, error } = await supabase.rpc('create_organization', {
      _name: name,
      ...(domain ? { _domain: domain } : {}),
    });
    if (error) return { error };
    const result = data as any;
    if (result?.error) return { error: { message: result.error } };

    await fetchOrg(user!.id);
    return { error: null };
  };

  const refreshOrg = async () => {
    if (user) await fetchOrg(user.id);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, orgId, orgName, userRole, mfaEnrolled, mfaVerified, aal, signUp, signIn, signOut, createOrg, refreshOrg, refreshMfa }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
