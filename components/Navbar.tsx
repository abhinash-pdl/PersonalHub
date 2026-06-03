'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useMusic } from '@/contexts/MusicContext';

const navLinks = [
  { href: '/dashboard/notes', label: 'Notes', icon: '📝' },
  { href: '/dashboard/music', label: 'Music', icon: '🎵' },
  { href: '/dashboard/gallery', label: 'Gallery', icon: '🖼️' },
  { href: '/dashboard/letters', label: 'Letters', icon: '💌' },
];

function formatTime(seconds: number): string {
  if (!seconds || Number.isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { currentTrack, isPlaying, currentTime, duration, togglePlay, prev, next, seek } = useMusic();
  const [menuOpen, setMenuOpen] = useState(false);

  const progress = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await logout();
      setMenuOpen(false);
      router.push('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <>
      <nav className="navbar">
        <Link href="/dashboard" className="nav-logo" aria-label="PersonalHub Dashboard">
          <div className="nav-logo-icon">✨</div>
          <span>PersonalHub</span>
        </Link>

        <button
          type="button"
          className="nav-menu-toggle"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          <span />
          <span />
          <span />
        </button>

        <div className="nav-links" role="navigation" aria-label="Dashboard sections">
          {navLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`nav-link${active ? ' active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => setMenuOpen(false)}
              >
                <div className="nav-dot" />
                <span>
                  {link.icon} {link.label}
                </span>
              </Link>
            );
          })}
        </div>

        <div className="nav-right">
          <div className="nav-user">
            <div className="nav-avatar">{(user?.email || 'U').slice(0, 1).toUpperCase()}</div>
            <span>{user?.email || 'user@example.com'}</span>
          </div>
          <button type="button" className="btn-logout" onClick={handleLogout}>
            ⬆ Logout
          </button>
        </div>

        <div className={`nav-mobile-panel${menuOpen ? ' open' : ''}`}>
          <div className="nav-mobile-links" role="navigation" aria-label="Dashboard sections">
            {navLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`nav-link${active ? ' active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setMenuOpen(false)}
                >
                  <div className="nav-dot" />
                  <span>
                    {link.icon} {link.label}
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="nav-mobile-meta">
            <div className="nav-user">
              <div className="nav-avatar">{(user?.email || 'U').slice(0, 1).toUpperCase()}</div>
              <span>{user?.email || 'user@example.com'}</span>
            </div>
            <button type="button" className="btn-logout" onClick={handleLogout}>
              ⬆ Logout
            </button>
          </div>
        </div>
      </nav>

      {currentTrack ? (
        <div className="music-bar">
          <div className="music-info">
            <div className="music-thumb">🎵</div>
            <div className="music-meta">
              <p>{currentTrack.title}</p>
              <span>{currentTrack.artist || 'Unknown Artist'}</span>
            </div>
          </div>

          <div className="music-controls">
            <button type="button" className="ctrl-btn" title="Previous" onClick={prev}>
              ◀◀
            </button>
            <button type="button" className="ctrl-btn play" title="Play/Pause" onClick={togglePlay}>
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button type="button" className="ctrl-btn" title="Next" onClick={next}>
              ▶▶
            </button>
            <Link
              href="/dashboard/music"
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                color: 'var(--text2)',
                textDecoration: 'none',
                fontSize: '11px',
                fontWeight: 600,
                marginLeft: '6px',
              }}
            >
              Library
            </Link>
          </div>

          <div className="music-progress">
            <span className="progress-time">{formatTime(currentTime)}</span>
            <div className="progress-track" onClick={(e) => {
              if (!duration) return;
              const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              const ratio = (e.clientX - rect.left) / rect.width;
              seek(Math.max(0, Math.min(duration * ratio, duration)));
            }}>
              <div className="progress-fill" style={{ width: `${progress}%` }} />
              <div className="progress-thumb" style={{ left: `${progress}%` }} />
            </div>
            <span className="progress-time">{formatTime(duration)}</span>
          </div>
        </div>
      ) : null}
    </>
  );
}
