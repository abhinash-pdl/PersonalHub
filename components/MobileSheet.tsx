'use client';

import React, { useEffect, useRef } from 'react';

interface MobileSheetProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Bottom-sheet container for mobile composers (new note / upload / letter / folder).
 * Desktop never renders this (FABs are mobile-only), but the same overlay doubles
 * as a centered modal on larger screens if ever reused.
 */
export default function MobileSheet({ title, onClose, children }: MobileSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Focus first field for fast entry
    const t = setTimeout(() => {
      sheetRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')?.focus({ preventScroll: true });
    }, 80);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [onClose]);

  return (
    <div className="expand-overlay" onClick={onClose} role="presentation">
      <button type="button" className="expand-close" aria-label="Close" onClick={onClose}>
        ✕
      </button>
      <div
        ref={sheetRef}
        className="expand-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h4>{title}</h4>
        <div style={{ marginTop: '12px' }}>{children}</div>
      </div>
    </div>
  );
}
