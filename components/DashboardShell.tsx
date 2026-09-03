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
