'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import { requestPasswordResetAction, signOutAction, updatePasswordAction } from '@/app/actions';
import { getCachedUser, getSupabaseClient, invalidateUserCache } from '@/lib/supabase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const clearLocalSession = useCallback(async () => {
    try {
      await getSupabaseClient().auth.signOut({ scope: 'local' });
    } catch {

    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const checkAuth = async () => {
      try {

        const cached = await getCachedUser();
        if (cancelled) return;
        setUser(cached);
        if (!cached && window.location.pathname.startsWith('/dashboard')) {
          router.replace('/');
        }
      } catch (error) {
        const message = String((error as { message?: unknown } | null | undefined)?.message || error);
        if (message.includes('Invalid Refresh Token') || message.includes('Refresh Token Not Found')) {
          await clearLocalSession();
          if (cancelled) return;
          setUser(null);
          if (window.location.pathname.startsWith('/dashboard')) {
            router.replace('/');
          }
        } else {
          console.error('Auth check error:', error);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    checkAuth();

    const { data: { subscription } } = getSupabaseClient().auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      invalidateUserCache();
      setUser(session?.user ?? null);
      if (!session?.user && window.location.pathname.startsWith('/dashboard')) {
        router.replace('/');
      }
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [clearLocalSession, router]);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {

      const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
      if (error) throw error;

      invalidateUserCache();
      setUser(data.user ?? data.session?.user ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const { data, error } = await getSupabaseClient().auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      if (!data.session) {
        throw new Error('Account created — check your inbox to confirm your email, then sign in.');
      }

      invalidateUserCache();
      setUser(data.user ?? data.session.user);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setLoading(true);
    try {
      const result = await signOutAction();
      if (!result.success) throw new Error(result.error || 'Logout failed');

      await clearLocalSession();
      invalidateUserCache();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [clearLocalSession]);

  const requestPasswordReset = useCallback(async (email: string) => {
    const result = await requestPasswordResetAction(email);
    if (!result.success) throw new Error(result.error || 'Could not send reset email');
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    setLoading(true);
    try {
      const result = await updatePasswordAction(newPassword);
      if (!result.success) throw new Error(result.error || 'Could not update password');
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, signup, logout, requestPasswordReset, updatePassword }),
    [user, loading, login, signup, logout, requestPasswordReset, updatePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
