'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

type Mode = 'login' | 'signup' | 'forgot';

/**
 * Surface auth-link failures (expired/used recovery link lands here with
 * ?error=&msg= instead of silently showing the login form). Computed lazily
 * as initial state; the params are cleared so refresh shows a clean form.
 */
function getLinkFailure(): { mode: Mode; error: string } | null {
  if (typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search);
  if (!q.get('error')) return null;
  const detail = (q.get('msg') || '').slice(0, 200);
  window.history.replaceState(null, '', window.location.pathname);
  return {
    mode: 'forgot',
    error:
      detail && !/missing its credentials/i.test(detail)
        ? `Password link problem: ${detail} Request a new reset link below.`
        : 'That password link is invalid or has expired. Request a new reset link below.',
  };
}

export default function LoginPage() {
  const { login, signup, requestPasswordReset, user } = useAuth();
  const router = useRouter();
  const [linkFailure] = useState(getLinkFailure);
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode]         = useState<Mode>(linkFailure?.mode ?? 'login');
  const [error, setError]       = useState(linkFailure?.error ?? '');
  const [notice, setNotice]     = useState('');
  const [loading, setLoading] = useState(false);
  const isSignup = mode === 'signup';

  useEffect(() => {
    if (user) router.push('/dashboard');
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      if (mode === 'forgot') {
        await requestPasswordReset(email);
        setNotice('If an account exists for this email, a reset link is on its way. Check your inbox (and spam).');
      } else if (isSignup) {
        await signup(email, password);
        router.push('/dashboard');
      } else {
        await login(email, password);
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      // Signup-with-confirmation is good news, not an error — show as notice.
      if (message.startsWith('Account created')) {
        setNotice(message);
        setError('');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setNotice('');
  };

  return (
    <div className="main" style={{ paddingTop: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="ambient ambient-1" />
      <div className="ambient ambient-2" />
      <div className="ambient ambient-3" />

      <div className="panel" style={{ position: 'static', width: '100%', maxWidth: 460, padding: '28px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div className="nav-logo-icon" style={{ width: 46, height: 46, borderRadius: 14, overflow: 'hidden' }}>
            <img src="/favicon.ico" alt="PersonalHub" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text3)', marginBottom: 4 }}>
              PersonalHub
            </p>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.7px', lineHeight: 1.1 }}>
              {mode === 'forgot' ? 'Reset your password' : isSignup ? 'Create your account' : 'Sign in to continue'}
            </h1>
          </div>
        </div>

        <p style={{ color: 'var(--text3)', fontSize: 16, marginBottom: 22, lineHeight: 1.6 }}>
          {mode === 'forgot'
            ? 'Enter your account email and we will send you a link to choose a new password.'
            : isSignup
              ? 'Make a new account to keep notes, music, photos, and letters in one place.'
              : 'Welcome back. Sign in to get back to your notes, music, photos, and letters.'}
        </p>

        {error && (
          <div role="alert" style={{
            marginBottom: 16,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid #ffffff44',
            background: 'rgba(255,255,255,0.04)',
            color: 'var(--text)',
            fontSize: 15,
            lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}

        {notice && (
          <div role="status" style={{
            marginBottom: 16,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid var(--border2)',
            background: 'rgba(255,255,255,0.04)',
            color: 'var(--text)',
            fontSize: 15,
            lineHeight: 1.5,
          }}>
            {notice}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="field-label">Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="field-input"
              style={{ height: 46 }}
            />
          </div>

          {mode !== 'forgot' && (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label className="field-label" style={{ marginBottom: 0 }}>Password</label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontWeight: 600, fontSize: 14, fontFamily: 'var(--font)' }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                className="field-input"
                style={{ height: 46 }}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{ marginTop: 6, opacity: loading ? 0.6 : 1, height: 48 }}
          >
            {loading ? 'Please wait…' : mode === 'forgot' ? 'Send reset link' : isSignup ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, color: 'var(--text3)' }}>
          {mode === 'forgot' ? (
            <>
              <span>Remembered it?</span>
              <button
                type="button"
                onClick={() => switchMode('login')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontWeight: 700, fontSize: 15, fontFamily: 'var(--font)' }}
              >
                Back to sign in
              </button>
            </>
          ) : (
            <>
              <span>{isSignup ? 'Already have an account?' : 'New here?'}</span>
              <button
                type="button"
                onClick={() => switchMode(isSignup ? 'login' : 'signup')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontWeight: 700, fontSize: 15, fontFamily: 'var(--font)' }}
              >
                {isSignup ? 'Sign in' : 'Create an account'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}