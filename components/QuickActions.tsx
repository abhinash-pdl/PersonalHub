'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { emitMobileAction } from '@/lib/mobile-actions';

/**
 * True only on touch-driven devices. Used as a JS gate (in addition to the
 * CSS gates) so FABs can never render on mouse desktops — even in a narrow
 * or zoomed window where width queries match. Starts false so SSR and the
 * first paint never flash a FAB on desktop.
 */
function useIsTouchDevice() {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const mqHoverNone = window.matchMedia('(hover: none)');
    const mqCoarse = window.matchMedia('(pointer: coarse)');
    const update = () =>
      setIsTouch(mqHoverNone.matches || mqCoarse.matches || 'ontouchstart' in window);
    update();
    mqHoverNone.addEventListener('change', update);
    mqCoarse.addEventListener('change', update);
    return () => {
      mqHoverNone.removeEventListener('change', update);
      mqCoarse.removeEventListener('change', update);
    };
  }, []);
  return isTouch;
}

/**
 * Mobile-only contextual FAB (single action per page, never a wall of buttons):
 * - /dashboard/notes          -> 📝 new note (bottom-sheet composer)
 * - /dashboard/music          -> 🎵 upload track (bottom-sheet uploader)
 * - /dashboard/letters        -> ✉️ new letter (bottom-sheet composer)
 * - /dashboard/gallery        -> 📁 new folder (bottom-sheet composer)
 * - /dashboard/gallery/[id]   -> 📷 camera + 🖼️ upload
 * Desktop keeps the full sidebar panels; this renders nothing there.
 */
export default function QuickActions() {
  const pathname = usePathname();
  const isTouch = useIsTouchDevice();

  // Desktop web: no FABs, ever. Creation lives in the sidebar panels there.
  if (!isTouch) return null;

  const fire = (type: 'composer:note' | 'composer:music' | 'composer:letter' | 'composer:folder' | 'gallery:camera' | 'gallery:upload') => () =>
    emitMobileAction(type);

  let actions: Array<{ key: string; label: string; icon: string; onClick: () => void }> | null = null;

  if (pathname === '/dashboard/notes') {
    actions = [{ key: 'note', label: 'Add note', icon: '📝', onClick: fire('composer:note') }];
  } else if (pathname === '/dashboard/music') {
    actions = [{ key: 'music', label: 'Upload track', icon: '🎵', onClick: fire('composer:music') }];
  } else if (pathname === '/dashboard/letters') {
    actions = [{ key: 'letter', label: 'Write letter', icon: '✉️', onClick: fire('composer:letter') }];
  } else if (pathname === '/dashboard/gallery') {
    actions = [{ key: 'folder', label: 'New folder', icon: '📁', onClick: fire('composer:folder') }];
  } else if (pathname.startsWith('/dashboard/gallery/')) {
    actions = [
      { key: 'camera', label: 'Take photo', icon: '📷', onClick: fire('gallery:camera') },
      { key: 'upload', label: 'Upload images', icon: '🖼️', onClick: fire('gallery:upload') },
    ];
  }

  if (!actions) return null;

  return (
    <div className="quick-actions show-mobile-only" aria-label="Quick actions">
      {actions.map((action) => (
        <button
          key={action.key}
          type="button"
          className="quick-action-btn"
          aria-label={action.label}
          title={action.label}
          onClick={action.onClick}
        >
          <span aria-hidden="true">{action.icon}</span>
        </button>
      ))}
    </div>
  );
}
