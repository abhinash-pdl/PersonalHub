'use client';

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            width: 48, 
            height: 48, 
            borderRadius: '50%', 
            border: '2px solid var(--border)',
            borderTopColor: 'var(--md-sys-color-primary)',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }}></div>
          <p style={{ color: 'var(--text3)', fontSize: 14 }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Router will handle the redirect
  }

  return <>{children}</>;
}
