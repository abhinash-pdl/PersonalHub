'use client';

import React, { useState } from 'react';
import Image from 'next/image';
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
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!accountOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAccountOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [accountOpen]);

  return (
    <div className="nav-mobile-account" ref={menuRef}>
      <button
        type="button"
        className="nav-account-toggle"
        aria-label={accountOpen ? 'Close account menu' : 'Open account menu'}
        aria-expanded={accountOpen}
        aria-haspopup="menu"
        onClick={() => setAccountOpen((value) => !value)}
      >
        <div className="nav-avatar">{email.slice(0, 1).toUpperCase()}</div>
      </button>

      {accountOpen ? (
        <div className="nav-account-panel" role="menu">
          <div className="nav-user">
            <div className="nav-avatar">{email.slice(0, 1).toUpperCase()}</div>
            <span title={email}>{email}</span>
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
        <Image
          src="/icons/logo.png"
          alt="PersonalHub logo"
          width={32}
          height={32}
          className="nav-logo-img"
          priority
        />
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
