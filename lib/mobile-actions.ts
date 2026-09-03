'use client';

import { useEffect } from 'react';

/**
 * Tiny event bus decoupling the mobile FAB (rendered in DashboardShell)
 * from the page that owns the actual form.
 *
 * FAB emits e.g. 'composer:note' -> Notes page listener opens a bottom-sheet
 * with the real NoteEditor. Works across server/client boundaries because
 * everything rides on window CustomEvents.
 */
export type MobileAction =
  | 'composer:note'
  | 'composer:music'
  | 'composer:letter'
  | 'composer:folder'
  | 'gallery:camera'
  | 'gallery:upload';

export function emitMobileAction(type: MobileAction, detail?: unknown) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(`ph:${type}`, { detail }));
}

export function useMobileAction(type: MobileAction, handler: (detail?: unknown) => void) {
  useEffect(() => {
    const listener = (event: Event) => {
      handler((event as CustomEvent).detail);
    };
    window.addEventListener(`ph:${type}`, listener);
    return () => {
      window.removeEventListener(`ph:${type}`, listener);
    };
  }, [type, handler]);
}
