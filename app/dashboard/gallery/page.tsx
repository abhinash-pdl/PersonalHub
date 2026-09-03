import React from 'react';
import { GalleryWorkspace } from '@/components/GalleryManager';
import { fetchGalleryFolders, fetchAllGalleryImages } from '@/lib/server-data';

export default async function GalleryPage() {
  const folders = await fetchGalleryFolders();
  const images = await fetchAllGalleryImages();

  return (
    <div>
      <div className="section-header">
        <div className="section-icon" style={{ background: 'var(--surface2)' }}>▣</div>
        <div>
          <div className="section-title">Gallery</div>
          <div className="section-sub">Organize and view your photos</div>
        </div>
      </div>
      <GalleryWorkspace folders={folders} images={images} />
    </div>
  );
}
