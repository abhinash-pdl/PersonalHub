'use client';

import React from 'react';
import { NoteItem } from '@/components/NoteEditor';
import { useDashboardData } from '@/contexts/DashboardDataContext';

export function NotesGrid() {
  const { notesData, loaded, refresh } = useDashboardData();

  if (!loaded) {
    return (
      <div className="empty-state">
        <p>Loading notes...</p>
      </div>
    );
  }

  if (notesData.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📝</div>
        <p>No notes yet. Create one to get started!</p>
      </div>
    );
  }

  return (
    <div className="notes-grid">
      {notesData.map((note) => (
        <NoteItem key={note.id} note={note} onDelete={() => refresh()} onSelect={() => refresh()} />
      ))}
    </div>
  );
}
