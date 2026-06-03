import React from 'react';
import dynamic from 'next/dynamic';

const MusicLibrary = dynamic(() => import('@/components/MusicLibrary'), {
  loading: () => <div className="empty-state"><p>Loading your music...</p></div>,
});

export default async function MusicPage() {
  return (
    <div>
      <div className="section-header">
        <div className="section-icon" style={{ background: 'rgba(168,85,247,0.12)' }}>🎵</div>
        <div>
          <div className="section-title">Your Music</div>
          <div className="section-sub">Upload once, play everywhere</div>
        </div>
      </div>
      <MusicLibrary />
    </div>
  );
}
