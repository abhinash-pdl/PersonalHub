import React from 'react';
import nextDynamic from 'next/dynamic';
import { fetchGalleryFolders, fetchAllGalleryImages } from '@/lib/server-data';

export const dynamic = 'force-dynamic';

const GalleryWorkspace = nextDynamic(
  () => import('@/components/GalleryManager').then((mod) => mod.GalleryWorkspace),
  {
    loading: () => <div className="empty-state"><p>Loading your gallery...</p></div>,
  },
);

export default async function GalleryPage() {
  const folders = await fetchGalleryFolders();
  const images = await fetchAllGalleryImages();

  return (
    <div>
      <div className="section-header">
        <div className="section-icon" style={{ background: 'rgba(6,182,212,0.12)' }}>🖼️</div>
        <div>
          <div className="section-title">Gallery</div>
          <div className="section-sub">Organize and view your photos</div>
        </div>
      </div>
      <GalleryWorkspace folders={folders} images={images} />
    </div>
  );
}
