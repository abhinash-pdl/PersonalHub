import React, { Suspense } from 'react';
import { fetchLetters } from '@/lib/server-data';
import { LetterCard, LetterEditor } from '@/components/LettersView';
import { LetterComposerSheet } from '@/components/MobileComposers';

export const dynamic = 'force-dynamic';

export default async function LettersPage() {
  return (
    <div>
      <div className="section-header">
        <div className="section-icon" style={{ background: 'var(--surface2)' }}>💌</div>
        <div>
          <div className="section-title">Letters</div>
          <div className="section-sub">Write and save your letters</div>
        </div>
      </div>

      <div className="letters-layout">
        {/* Desktop inline composer — hidden on mobile, replaced by the ✉️ FAB sheet */}
        <div className="panel hide-mobile">
          <div className="panel-title">✍️ Write Letter</div>
          <LetterEditor />
        </div>

        <div>
          <Suspense fallback={<div className="empty-state"><p>Loading letters...</p></div>}>
            <LettersContent />
          </Suspense>
        </div>
      </div>

      {/* Mobile-only bottom-sheet composer, opened by the ✉️ FAB */}
      <LetterComposerSheet />
    </div>
  );
}

async function LettersContent() {
  const letters = await fetchLetters();

  if (letters.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">💌</div>
        <p>No letters yet. Write your first one!</p>
      </div>
    );
  }

  return (
    <div className="letter-cards">
      {letters.map((letter) => (
        <LetterCard key={letter.id} letter={letter} />
      ))}
    </div>
  );
}
