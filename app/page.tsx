'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const { login, signup, user } = useAuth();
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    if (user) router.push('/dashboard');
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isSignup) {
        await signup(email, password);
      } else {
        await login(email, password);
      }
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="main" style={{ paddingTop: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="ambient ambient-1" />
      <div className="ambient ambient-2" />
      <div className="ambient ambient-3" />

      <div className="panel" style={{ position: 'static', width: '100%', maxWidth: 460, padding: '28px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div className="nav-logo-icon" style={{ width: 46, height: 46, borderRadius: 14, fontSize: 20 }}>✨</div>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text3)', marginBottom: 4 }}>
              PersonalHub
            </p>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.7px', lineHeight: 1.1 }}>
              {isSignup ? 'Create your account' : 'Sign in to continue'}
            </h1>
          </div>
        </div>

        <p style={{ color: 'var(--text3)', fontSize: 14, marginBottom: 22, lineHeight: 1.6 }}>
          {isSignup
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
            fontSize: 13,
            lineHeight: 1.5,
          }}>
            {error}
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

          <div style={{ display: 'grid', gap: 6 }}>
            <label className="field-label">Password</label>
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

          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{ marginTop: 6, opacity: loading ? 0.6 : 1, height: 48 }}
          >
            {loading ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, color: 'var(--text3)' }}>
          <span>{isSignup ? 'Already have an account?' : 'New here?'}</span>
          <button
            type="button"
            onClick={() => { setIsSignup(!isSignup); setError(''); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontWeight: 700, fontSize: 13, fontFamily: 'var(--font)' }}
          >
            {isSignup ? 'Sign in' : 'Create an account'}
          </button>
        </div>
      </div>
    </div>
  );
}