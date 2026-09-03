'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { verifyPasswordAction } from '@/app/actions';

/**
 * Logged-in password change: verifies the current password first,
 * then sets the new one. Used on the account page.
 */
export default function ChangePasswordForm() {
  const { user, updatePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDone(false);
    if (!user?.email) {
      setError('You are not signed in');
      return;
    }
    if (next.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    if (next !== confirm) {
      setError('New passwords do not match');
      return;
    }
    if (next === current) {
      setError('New password must be different from the current one');
      return;
    }
    setLoading(true);
    try {
      const check = await verifyPasswordAction(user.email, current);
      if (!check.success) throw new Error(check.error || 'Current password is incorrect');
      await updatePassword(next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {error && (
        <p role="alert" className="section-sub" style={{ color: 'var(--text)', marginBottom: '10px' }}>{error}</p>
      )}
      {done && (
        <p role="status" className="section-sub" style={{ color: 'var(--text)', marginBottom: '10px' }}>
          Password changed. Other devices have been signed out.
        </p>
      )}
      <form onSubmit={handleSubmit}>
        <label className="field-label">Current password</label>
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          autoComplete="current-password"
          className="field-input"
        />
        <label className="field-label">New password</label>
        <input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
          className="field-input"
        />
        <label className="field-label">Confirm new password</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
          className="field-input"
        />
        <button type="submit" disabled={loading} className="btn-primary" style={{ opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Please wait…' : 'Change password'}
        </button>
      </form>
    </div>
  );
}
