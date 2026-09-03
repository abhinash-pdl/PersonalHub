'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import AppNav from '@/components/AppNav';

function MobileAccountMenu({
  email,
  onLogout,
}: {
  email: string;
  onLogout: () => void;
}) {
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <div className="nav-mobile-account">
      <button
        type="button"
        className="nav-account-toggle"
        aria-label={accountOpen ? 'Close account menu' : 'Open account menu'}
        aria-expanded={accountOpen}
        onClick={() => setAccountOpen((value) => !value)}
      >
        <div className="nav-avatar">{email.slice(0, 1).toUpperCase()}</div>
      </button>

      {accountOpen ? (
        <div className="nav-account-panel">
          <div className="nav-user">
            <div className="nav-avatar">{email.slice(0, 1).toUpperCase()}</div>
            <span>{email}</span>
          </div>
          <button type="button" className="btn-logout" onClick={onLogout}>
            Logout
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function Navbar() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const email = user?.email || 'user@example.com';

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <header className="navbar">
      <Link href="/dashboard" prefetch={true} className="nav-logo" aria-label="PersonalHub Dashboard">
        <div className="nav-logo-icon">PH</div>
        <span>PersonalHub</span>
      </Link>

      <AppNav variant="top" />

      <div className="nav-right">
        <div className="nav-user">
          <div className="nav-avatar">{email.slice(0, 1).toUpperCase()}</div>
          <span>{email}</span>
        </div>
        <button type="button" className="btn-logout" onClick={handleLogout}>
          Logout
        </button>
      </div>

      <MobileAccountMenu email={email} onLogout={handleLogout} />
    </header>
  );
}
