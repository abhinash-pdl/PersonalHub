'use client';

import React, { useState } from 'react';
import { createNoteAction, deleteNoteAction, updateNoteAction } from '@/app/actions';
import { useDashboardData } from '@/contexts/DashboardDataContext';
import { useRouter } from 'next/navigation';

interface Note {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

interface NoteEditorProps {
  initialNote?: Note;
  onSave?: () => void;
  onCancel?: () => void;
}

export function NoteEditor({ initialNote, onSave, onCancel }: NoteEditorProps) {
  const router = useRouter();
  const { refresh } = useDashboardData();
  const [title, setTitle] = useState(initialNote?.title || '');
  const [content, setContent] = useState(initialNote?.content || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Server actions resolve { success } instead of throwing — a failed
      // insert must surface, not silently clear the form.
      const result = initialNote
        ? await updateNoteAction(initialNote.id, title, content)
        : await createNoteAction(title, content);
      if (!result.success) {
        throw new Error(result.error || 'Failed to save note');
      }
      setTitle('');
      setContent('');
      onSave?.();
      // NotesGrid reads client-side context (not server props), so refresh it.
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <label className="field-label">Title</label>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Note title..."
        className="field-input"
      />

      <label className="field-label">Content</label>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write your note here..."
        rows={8}
        className="field-input"
      />

      {error ? <p className="section-sub" style={{ color: 'var(--text)', marginBottom: '10px' }}>{error}</p> : null}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" onClick={handleSave} disabled={loading} className="btn-primary">
          {loading ? 'Saving...' : 'Save Note'}
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

interface NoteItemProps {
  note: Note;
  onSelect?: (note: Note) => void;
  onDelete?: (id: string) => void;
}

export function NoteItem({ note, onSelect, onDelete }: NoteItemProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    if (!confirm('Delete this note?')) return;
    setDeleting(true);
    try {
      const result = await deleteNoteAction(note.id);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete note');
      }
      onDelete?.(note.id);
      router.refresh();
    } catch (error) {
      console.error('Failed to delete:', error);
    } finally {
      setDeleting(false);
    }
  };

  const openExpanded = () => {
    onSelect?.(note);
    setTitle(note.title);
    setContent(note.content);
    setEditing(false);
    setError('');
    setExpanded(true);
  };

  const startEdit = () => {
    setTitle(note.title);
    setContent(note.content);
    setError('');
    setEditing(true);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await updateNoteAction(note.id, title, content);
      if (!result.success) {
        throw new Error(result.error || 'Failed to update note');
      }
      setEditing(false);
      // Close so reopening reads fresh props (local edit state is stale after save)
      setExpanded(false);
      onSelect?.({ ...note, title, content });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update note');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div onClick={openExpanded} className="note-card">
        <h4>{note.title}</h4>
        <p>{note.content || 'No content'}</p>
        <div className="note-footer">
          <span className="note-date">{new Date(note.created_at).toLocaleDateString()}</span>
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
                <label className="field-label">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="field-input"
                  placeholder="Note title..."
                />
                <label className="field-label">Content</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={8}
                  className="field-input"
                  placeholder="Write your note here..."
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
                <h4>{note.title}</h4>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="note-date">{new Date(note.created_at).toLocaleDateString()}</span>
                  <button type="button" onClick={startEdit} className="btn-delete" style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '6px 12px' }}>
                    ✏️ Edit
                  </button>
                </div>
                <div className="expand-body">{note.content || 'No content'}</div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
