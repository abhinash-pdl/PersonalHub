'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { emitMobileAction } from '@/lib/mobile-actions';

function useMobileChrome() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mobileWidth = window.matchMedia('(max-width: 860px)');
    const noHover = window.matchMedia('(hover: none)');
    const coarsePointer = window.matchMedia('(pointer: coarse)');
    const update = () =>
      setIsMobile(mobileWidth.matches || noHover.matches || coarsePointer.matches);
    update();
    mobileWidth.addEventListener('change', update);
    noHover.addEventListener('change', update);
    coarsePointer.addEventListener('change', update);
    return () => {
      mobileWidth.removeEventListener('change', update);
      noHover.removeEventListener('change', update);
      coarsePointer.removeEventListener('change', update);
    };
  }, []);
  return isMobile;
}

export default function QuickActions() {
  const pathname = usePathname();
  const showActions = useMobileChrome();

  if (!showActions) return null;

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
    <div className="quick-actions" aria-label="Quick actions">
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
