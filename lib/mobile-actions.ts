'use client';

import { useEffect } from 'react';

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
