import React from 'react';
import { NoteEditor, NoteItem } from '@/components/NoteEditor';
import { NotesGrid } from '@/components/NotesGrid';
import { NoteComposerSheet } from '@/components/MobileComposers';

export default function NotesPage() {
  return (
    <div>
      <div className="section-header">
        <div className="section-icon" style={{ background: 'var(--surface2)' }}>📝</div>
        <div>
          <div className="section-title">Your Notes</div>
          <div className="section-sub">Keep your thoughts organized and accessible</div>
        </div>
      </div>

      <div className="notes-layout">
        {/* Desktop inline composer — hidden on mobile, replaced by the 📝 FAB sheet */}
        <div className="panel hide-mobile">
          <div className="panel-title">✏️ Create Note</div>
          <NoteEditor />
        </div>

        <div>
          <NotesGrid />
        </div>
      </div>

      {/* Mobile-only bottom-sheet composer, opened by the 📝 FAB */}
      <NoteComposerSheet />
    </div>
  );
}
