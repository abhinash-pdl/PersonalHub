'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

function ResetForm() {
  const { updatePassword, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(searchParams.get('error') ? 'This reset link is invalid or expired. Request a new one below.' : '');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await updatePassword(password);
      setDone(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not reset password';
      // Recovery session missing/expired — send them back to request a fresh link.
      setError(/session|token|expired|invalid/i.test(message) ? `${message}. Request a new reset link from the sign-in page.` : message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="main" style={{ paddingTop: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="panel" style={{ position: 'static', width: '100%', maxWidth: 460, padding: '28px 26px' }}>
        <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text3)', marginBottom: 4 }}>
          PersonalHub
        </p>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.7px', lineHeight: 1.1, marginBottom: 8 }}>
          Choose a new password
        </h1>
        <p style={{ color: 'var(--text3)', fontSize: 16, marginBottom: 22, lineHeight: 1.6 }}>
          {user?.email ? `Signed in as ${user.email}.` : 'Enter and confirm your new password below.'}
        </p>

        {error && (
          <div role="alert" style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 12, border: '1px solid #ffffff44', background: 'rgba(255,255,255,0.04)', color: 'var(--text)', fontSize: 15, lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        {done ? (
          <div>
            <div role="status" style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border2)', background: 'rgba(255,255,255,0.04)', color: 'var(--text)', fontSize: 15, lineHeight: 1.5 }}>
              Password updated. You can now sign in with your new password.
            </div>
            <button type="button" className="btn-primary" onClick={() => router.push(user ? '/dashboard' : '/')}>
              {user ? 'Go to dashboard' : 'Back to sign in'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <label className="field-label">New password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="field-input"
                style={{ height: 46 }}
              />
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label className="field-label">Confirm new password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="field-input"
                style={{ height: 46 }}
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary" style={{ marginTop: 6, opacity: loading ? 0.6 : 1, height: 48 }}>
              {loading ? 'Please wait…' : 'Set new password'}
            </button>
          </form>
        )}

        <div style={{ marginTop: 18, textAlign: 'center', fontSize: 15 }}>
          <Link href="/" style={{ color: 'var(--text2)', fontWeight: 600 }}>Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="main"><div className="empty-state"><p>Loading…</p></div></div>}>
      <ResetForm />
    </Suspense>
  );
}
