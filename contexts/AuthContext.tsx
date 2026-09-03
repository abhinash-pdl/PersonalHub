'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { signInAction, signOutAction, signUpAction } from '@/app/actions';
import { getCachedUser, getSupabaseClient, withAuthRetry } from '@/lib/supabase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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
        const cached = await getCachedUser();
        if (!cancelled) setUser(cached);
      } catch (error) {
        const message = String((error as { message?: unknown } | null | undefined)?.message || error);
        if (message.includes('Invalid Refresh Token') || message.includes('Refresh Token Not Found')) {
          await clearLocalSession();
          if (!cancelled) setUser(null);
        } else {
          console.error('Auth check error:', error);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    checkAuth();

    // Keep in sync without extra getUser() calls
    const { data: { subscription } } = getSupabaseClient().auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setUser(session?.user ?? null);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [clearLocalSession]);

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

      const session = result.session;
      if (session) {
        const { access_token, refresh_token } = session;
        await withAuthRetry(() => getSupabaseClient().auth.setSession({
          access_token,
          refresh_token,
        }));
      }

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
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [clearLocalSession]);

  const value = useMemo(
    () => ({ user, loading, login, signup, logout }),
    [user, loading, login, signup, logout],
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
