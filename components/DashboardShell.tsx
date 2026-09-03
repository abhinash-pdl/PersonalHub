'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import AppNav from '@/components/AppNav';
import MusicBar from '@/components/MusicBar';
import QuickActions from '@/components/QuickActions';
import { MusicProvider } from '@/contexts/MusicContext';
import { DashboardDataProvider } from '@/contexts/DashboardDataContext';
import { dashboardNavLinks } from '@/lib/nav';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    // Build stamp: proves which bundle the browser is actually running.
    // If you don't see this exact line in the console, you're on stale code.
    console.info('[PersonalHub] build 2026-09-04-ui-07 (centered viewer, pointer-gated FABs)');
    for (const link of dashboardNavLinks) {
      router.prefetch(link.href);
    }
  }, [router]);

  return (
    <MusicProvider>
      <DashboardDataProvider>
        <div className="app-shell">
          <Navbar />
          <main className="main">{children}</main>
          <MusicBar />
          <QuickActions />
          <AppNav variant="bottom" />
        </div>
      </DashboardDataProvider>
    </MusicProvider>
  );
}
