import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  orgId: string | null;
  orgName: string | null;
  userRole: 'admin' | 'member' | null;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  createOrg: (name: string) => Promise<{ error: any }>;
  refreshOrg: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'member' | null>(null);

  const fetchOrg = async (userId: string) => {
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('organization_id, role')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (roleData) {
      setOrgId(roleData.organization_id);
      setUserRole(roleData.role as 'admin' | 'member');
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

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(() => fetchOrg(session.user.id), 0);
      } else {
        setOrgId(null);
        setOrgName(null);
        setUserRole(null);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchOrg(session.user.id);
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

  const createOrg = async (name: string) => {
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({ name })
      .select()
      .single();
    if (orgError) return { error: orgError };

    const { error: roleError } = await supabase
      .from('user_roles')
      .insert({ user_id: user!.id, organization_id: org.id, role: 'admin' });
    if (roleError) return { error: roleError };

    await fetchOrg(user!.id);
    return { error: null };
  };

  const refreshOrg = async () => {
    if (user) await fetchOrg(user.id);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, orgId, orgName, userRole, signUp, signIn, signOut, createOrg, refreshOrg }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
