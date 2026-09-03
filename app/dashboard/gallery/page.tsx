import React from 'react';
import { GalleryFolders } from '@/components/GalleryManager';
import { FolderIcon } from '@/components/icons';
import { fetchGalleryFolders } from '@/lib/server-data';

export const dynamic = 'force-dynamic';

/**
 * Folders-first gallery: pick (or create) a folder, tap to open it.
 * Photos live on /dashboard/gallery/[folderId].
 */
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
      <div className="panel">
        <div className="panel-title"><FolderIcon /> Folders</div>
        <GalleryFolders folders={folders} />
      </div>
    </div>
  );
}
