import React from 'react';
import ChangePasswordForm from '@/components/ChangePasswordForm';
import { getCurrentUserEmail } from '@/lib/server-data';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const email = await getCurrentUserEmail();
  const initial = (email || 'U').slice(0, 1).toUpperCase();

  return (
    <div>
      <div className="section-header">
        <div className="section-icon" style={{ background: 'var(--surface2)' }}>👤</div>
        <div>
          <div className="section-title">Account</div>
          <div className="section-sub">Signed in as {email || '…'}</div>
        </div>
      </div>

      <div className="notes-layout">
        <div className="panel">
          <div className="panel-title">👤 Profile</div>
          <div className="account-profile">
            <div className="account-avatar" aria-hidden="true">{initial}</div>
            <div className="account-identity">
              <p title={email || undefined}>{email || '…'}</p>
              <span className="badge badge-cyan">Signed in</span>
            </div>
          </div>
        </div>

        <div>
          <div className="panel" style={{ marginBottom: '20px' }}>
            <div className="panel-title">🔑 Change password</div>
            <ChangePasswordForm />
          </div>

          <div className="panel">
            <div className="panel-title">ℹ️ Good to know</div>
            <div className="account-rows">
              <div className="account-row">
                <span>Other devices</span>
                <p>Changing your password signs out every other device.</p>
              </div>
              <div className="account-row">
                <span>Locked out?</span>
                <p>Use “Forgot password?” on the sign-in page and follow the email link to choose a new one.</p>
              </div>
              <div className="account-row">
                <span>Reset links</span>
                <p>Each email link works once and expires quickly — request a fresh one if yours lapses.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
