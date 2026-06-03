'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { signInAction, signOutAction, signUpAction } from '@/app/actions';
import { getSupabaseClient } from '@/lib/supabase';

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

  const clearLocalSession = async () => {
    try {
      await getSupabaseClient().auth.signOut({ scope: 'local' });
    } catch {
      // Ignore cleanup failures when the browser session is already invalid.
    }
  };

  useEffect(() => {
    // Check current session
    const checkAuth = async () => {
      try {
        const { data, error } = await getSupabaseClient().auth.getUser();
        if (error && (error.message.includes('Invalid Refresh Token') || error.message.includes('Refresh Token Not Found'))) {
          await clearLocalSession();
          setUser(null);
          return;
        }

        setUser(data.user || null);
      } catch (error) {
        const message = String((error as { message?: unknown } | null | undefined)?.message || error);
        if (message.includes('Invalid Refresh Token') || message.includes('Refresh Token Not Found')) {
          await clearLocalSession();
          setUser(null);
        } else {
          console.error('Auth check error:', error);
        }
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    // Subscribe to auth changes
    const { data } = getSupabaseClient().auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => {
      if (data?.subscription) {
        data.subscription.unsubscribe();
      }
    };
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const result = await signInAction(email, password);
      if (!result.success) throw new Error(result.error || 'Login failed');

      if (result.session) {
        await getSupabaseClient().auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token,
        });
      }

      setUser(result.user);
    } finally {
      setLoading(false);
    }
  };

  const signup = async (email: string, password: string) => {
    setLoading(true);
    try {
      const result = await signUpAction(email, password);
      if (!result.success) throw new Error(result.error || 'Signup failed');

      if (result.session) {
        await getSupabaseClient().auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token,
        });
      }

      setUser(result.user);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      const result = await signOutAction();
      if (!result.success) throw new Error(result.error || 'Logout failed');

      await clearLocalSession();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
