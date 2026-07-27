import { createContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { authService } from '../services/authService';
import type { AuthContextType, User, Session } from '../types/auth';

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY') {
        window.location.hash = '';
        window.location.href = '/reset-password';
        return;
      }
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    return authService.signUp(email, password);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    return authService.signIn(email, password);
  }, []);

  const signOut = useCallback(async () => {
    await authService.signOut();
    setUser(null);
    setSession(null);
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    await authService.forgotPassword(email);
  }, []);

  const resetPassword = useCallback(async (password: string) => {
    await authService.resetPassword(password);
  }, []);

  const refreshSession = useCallback(async () => {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) throw error;
    setSession(data.session);
    setUser(data.session?.user ?? null);
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      session,
      loading,
      isAuthenticated: !!user && !!session,
      signUp,
      signIn,
      signOut,
      forgotPassword,
      resetPassword,
      refreshSession,
    }),
    [user, session, loading, signUp, signIn, signOut, forgotPassword, resetPassword, refreshSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
