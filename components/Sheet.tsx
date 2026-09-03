'use client';

import React, { useEffect, useRef } from 'react';

interface SheetProps {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Mobile-friendly bottom-sheet confirm dialog.
 * Replaces native confirm() which is unstyled/blocking on mobile.
 * Handles scroll-lock, Esc, and overlay-click close.
 */
export default function Sheet({
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onClose,
}: SheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    sheetRef.current?.querySelector<HTMLButtonElement>('[data-autofocus]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="expand-overlay sheet-overlay" onClick={onClose} role="presentation">
      <div
        ref={sheetRef}
        className="expand-modal sheet-modal"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h4>{title}</h4>
        {description ? <p className="expand-body">{description}</p> : null}
        <div className="sheet-actions">
          <button type="button" className="btn-primary sheet-cancel" data-autofocus onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn-primary sheet-confirm"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
