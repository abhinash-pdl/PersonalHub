'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import { requestPasswordResetAction, signInAction, signOutAction, signUpAction, updatePasswordAction } from '@/app/actions';
import { getCachedUser, getSupabaseClient, invalidateUserCache, withAuthRetry } from '@/lib/supabase';

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
      // Ignore cleanup failures when the browser session is already invalid.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const checkAuth = async () => {
      try {
        // Single shared cached lookup with lock retry — avoids Navigator
        // LockManager contention with Music/Dashboard providers.
        // getCachedUser() returns null ONLY on confirmed sign-out (it never
        // throws for missing/invalid sessions), so a null here is safe to
        // act on: leave protected routes for the login page.
        const cached = await getCachedUser();
        if (cancelled) return;
        setUser(cached);
        if (!cached && window.location.pathname.startsWith('/dashboard')) {
          router.push('/');
        }
      } catch (error) {
        const message = String((error as { message?: unknown } | null | undefined)?.message || error);
        if (message.includes('Invalid Refresh Token') || message.includes('Refresh Token Not Found')) {
          await clearLocalSession();
          if (cancelled) return;
          setUser(null);
          if (window.location.pathname.startsWith('/dashboard')) {
            router.push('/');
          }
        } else {
          console.error('Auth check error:', error);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    checkAuth();

    // Keep in sync without extra getUser() calls. A SIGNED_OUT event with no
    // session is authoritative — leave protected routes for the login page.
    const { data: { subscription } } = getSupabaseClient().auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setUser(session?.user ?? null);
      if (!session?.user && window.location.pathname.startsWith('/dashboard')) {
        router.push('/');
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
      const result = await signInAction(email, password);
      if (!result.success) throw new Error(result.error || 'Login failed');

      const session = result.session;
      if (session) {
        const { access_token, refresh_token } = session;
        await withAuthRetry(() => getSupabaseClient().auth.setSession({
          access_token,
          refresh_token,
        }));
      }

      // Drop any cached signed-out state so data loads immediately.
      invalidateUserCache();
      setUser(result.user);
    } finally {
      setLoading(false);
    }
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const result = await signUpAction(email, password);
      if (!result.success) throw new Error(result.error || 'Signup failed');
      if (result.needsConfirmation) {
        throw new Error('Account created — check your inbox to confirm your email, then sign in.');
      }

      const session = result.session;
      if (session) {
        const { access_token, refresh_token } = session;
        await withAuthRetry(() => getSupabaseClient().auth.setSession({
          access_token,
          refresh_token,
        }));
      }

      // Drop any cached signed-out state so data loads immediately.
      invalidateUserCache();
      setUser(result.user);
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
