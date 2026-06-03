'use client';

import React from 'react';
import Navbar from '@/components/Navbar';
import { AuthGuard } from '@/components/AuthGuard';
import { MusicProvider } from '@/contexts/MusicContext';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <MusicProvider>
        <div className="min-h-screen">
          <div className="ambient ambient-1" aria-hidden />
          <div className="ambient ambient-2" aria-hidden />
          <div className="ambient ambient-3" aria-hidden />
          <Navbar />
          <main className="main">
            {children}
          </main>
        </div>
      </MusicProvider>
    </AuthGuard>
  );
}