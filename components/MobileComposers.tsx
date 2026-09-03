'use client';

import React, { useCallback, useState } from 'react';
import { useMobileAction } from '@/lib/mobile-actions';
import { NoteEditor } from '@/components/NoteEditor';
import { LetterEditor } from '@/components/LettersView';
import MobileSheet from '@/components/MobileSheet';

/** Mobile-only: opens the note composer as a bottom sheet when the notes FAB fires. */
export function NoteComposerSheet() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useMobileAction(
    'composer:note',
    useCallback(() => setOpen(true), []),
  );

  if (!open) return null;
  return (
    <MobileSheet title="✏️ New Note" onClose={close}>
      <NoteEditor onSave={close} onCancel={close} />
    </MobileSheet>
  );
}

/** Mobile-only: opens the letter composer as a bottom sheet when the letters FAB fires. */
export function LetterComposerSheet() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useMobileAction(
    'composer:letter',
    useCallback(() => setOpen(true), []),
  );

  if (!open) return null;
  return (
    <MobileSheet title="✍️ New Letter" onClose={close}>
      <LetterEditor onSave={close} onCancel={close} />
    </MobileSheet>
  );
}
