'use client';

import React, { useCallback, useState } from 'react';
import { useMobileAction } from '@/lib/mobile-actions';
import { NoteEditor } from '@/components/NoteEditor';
import { LetterEditor } from '@/components/LettersView';
import MobileSheet from '@/components/MobileSheet';

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
