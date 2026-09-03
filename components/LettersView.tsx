'use client';

import React, { useState } from 'react';
import { createLetterAction, deleteLetterAction, updateLetterAction } from '@/app/actions';
import { useRouter } from 'next/navigation';

interface Letter {
  id: string;
  title: string;
  content: string;
  recipient: string;
  recipient_email?: string;
  created_at: string;
}

interface LettersProps {
  letters: Letter[];
  onRefresh?: () => void;
}

export function LettersView({ letters, onRefresh }: LettersProps) {
  const [showNew, setShowNew] = useState(false);

  return (
    <div>
      {showNew ? (
        <LetterEditor
          onSave={() => {
            setShowNew(false);
            onRefresh?.();
          }}
          onCancel={() => setShowNew(false)}
        />
      ) : (
        <button type="button" onClick={() => setShowNew(true)} className="btn-primary rose" style={{ marginBottom: '14px' }}>
          ✍️ Write New Letter
        </button>
      )}

      {letters.length > 0 ? (
        <div className="letter-cards">
          {letters.map((letter) => (
            <LetterCard key={letter.id} letter={letter} onDelete={() => onRefresh?.()} />
          ))}
        </div>
      ) : (
        !showNew && (
          <div className="empty-state">
            <div className="empty-icon">💌</div>
            <p>No letters yet. Write your first one!</p>
          </div>
        )
      )}
    </div>
  );
}

interface LetterEditorProps {
  onSave?: () => void;
  onCancel?: () => void;
}

export function LetterEditor({ onSave, onCancel }: LetterEditorProps) {
  const router = useRouter();
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!recipientName.trim() || !content.trim()) {
      setError('Recipient name and content are required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await createLetterAction(recipientName.trim(), content, recipientEmail.trim() || undefined);
      if (!result.success) {
        throw new Error(result.error || 'Failed to save letter');
      }
      onSave?.();
      setRecipientName('');
      setRecipientEmail('');
      setContent('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save letter');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <label className="field-label">Recipient name</label>
      <input
        type="text"
        value={recipientName}
        onChange={(e) => setRecipientName(e.target.value)}
        placeholder="Recipient name..."
        className="field-input"
      />

      <label className="field-label">Email (optional)</label>
      <input
        type="email"
        value={recipientEmail}
        onChange={(e) => setRecipientEmail(e.target.value)}
        placeholder="recipient@email.com"
        className="field-input"
      />

      <label className="field-label">Letter content</label>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write your letter here..."
        rows={10}
        className="field-input"
      />

      {error ? <p className="section-sub" style={{ color: 'var(--text)', marginBottom: '10px' }}>{error}</p> : null}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" onClick={handleSave} disabled={loading} className="btn-primary rose">
          {loading ? 'Saving...' : 'Save Letter'}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="btn-delete"
            style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '0 12px' }}
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}

interface LetterCardProps {
  letter: Letter;
  onDelete?: () => void;
}

export function LetterCard({ letter, onDelete }: LetterCardProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [recipientName, setRecipientName] = useState(letter.recipient);
  const [recipientEmail, setRecipientEmail] = useState(letter.recipient_email || '');
  const [content, setContent] = useState(letter.content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    if (!confirm('Delete this letter?')) return;
    setDeleting(true);
    try {
      await deleteLetterAction(letter.id);
      onDelete?.();
      router.refresh();
    } catch (error) {
      console.error('Failed to delete:', error);
    } finally {
      setDeleting(false);
    }
  };

  const openExpanded = () => {
    setRecipientName(letter.recipient);
    setRecipientEmail(letter.recipient_email || '');
    setContent(letter.content);
    setEditing(false);
    setError('');
    setExpanded(true);
  };

  const startEdit = () => {
    setRecipientName(letter.recipient);
    setRecipientEmail(letter.recipient_email || '');
    setContent(letter.content);
    setError('');
    setEditing(true);
  };

  const handleSave = async () => {
    if (!recipientName.trim() || !content.trim()) {
      setError('Recipient name and content are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await updateLetterAction(letter.id, recipientName.trim(), content, recipientEmail.trim() || undefined);
      if (!result.success) {
        throw new Error(result.error || 'Failed to update letter');
      }
      setEditing(false);
      // Close so reopening reads fresh props (local edit state is stale after save)
      setExpanded(false);
      onDelete?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update letter');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="letter-card" onClick={openExpanded}>
        <h4>{letter.title}</h4>
        <div className="letter-to">
          💌 To: {letter.recipient}
          {letter.recipient_email ? ` • ${letter.recipient_email}` : ''}
        </div>
        <p className="letter-preview">{letter.content || 'No content'}</p>

        <div className="note-footer">
          <span className="note-date">{new Date(letter.created_at).toLocaleDateString()}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            disabled={deleting}
            className="btn-delete"
          >
            {deleting ? '...' : '✕'}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="expand-overlay" onClick={() => setExpanded(false)}>
          <button
            type="button"
            className="expand-close"
            aria-label="Close"
            onClick={() => setExpanded(false)}
          >
            ✕
          </button>
          <div className="expand-modal" onClick={(e) => e.stopPropagation()}>
            {editing ? (
              <>
                <label className="field-label">Recipient name</label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="field-input"
                  placeholder="Recipient name..."
                />
                <label className="field-label">Email (optional)</label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className="field-input"
                  placeholder="recipient@email.com"
                />
                <label className="field-label">Letter content</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={10}
                  className="field-input"
                  placeholder="Write your letter here..."
                />
                {error ? <p className="section-sub" style={{ color: 'var(--text)', marginTop: '10px' }}>{error}</p> : null}
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button type="button" onClick={handleSave} disabled={saving} className="btn-primary">
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    disabled={saving}
                    className="btn-delete"
                    style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '0 12px' }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <h4>{letter.title}</h4>
                <div className="letter-to">
                  💌 To: {letter.recipient}
                  {letter.recipient_email ? ` • ${letter.recipient_email}` : ''}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                  <span className="note-date">{new Date(letter.created_at).toLocaleDateString()}</span>
                  <button type="button" onClick={startEdit} className="btn-delete" style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '6px 12px' }}>
                    ✏️ Edit
                  </button>
                </div>
                <div className="expand-body">{letter.content || 'No content'}</div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
