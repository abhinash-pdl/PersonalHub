import React from 'react';
import { GalleryFolders } from '@/components/GalleryManager';
import { fetchGalleryFolders } from '@/lib/server-data';

export const dynamic = 'force-dynamic';

export default async function GalleryPage() {
  const folders = await fetchGalleryFolders();

  return (
    <div>
      <div className="section-header">
        <div className="section-icon" style={{ background: 'var(--surface2)' }}>▣</div>
        <div>
          <div className="section-title">Gallery</div>
          <div className="section-sub">Choose a folder to view and add photos</div>
        </div>
      </div>
      <GalleryFolders folders={folders} />
    </div>
  );
}
