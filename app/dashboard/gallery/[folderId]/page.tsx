import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GalleryImages } from '@/components/GalleryManager';
import { fetchGalleryFolders, fetchGalleryImages } from '@/lib/server-data';

export const dynamic = 'force-dynamic';

interface FolderPageProps {
  params: Promise<{ folderId: string }>;
}

/** Inside a folder: photos + upload / camera (FABs on mobile). */
export default async function GalleryFolderPage({ params }: FolderPageProps) {
  const { folderId } = await params;
  const [folders, images] = await Promise.all([
    fetchGalleryFolders(),
    fetchGalleryImages(folderId),
  ]);
  const folder = folders.find((f) => String((f as { id?: unknown }).id) === folderId);

  if (!folder) notFound();

  const name = String((folder as { name?: unknown }).name || 'Folder');

  return (
    <div>
      <div className="section-header">
        <Link
          href="/dashboard/gallery"
          prefetch
          className="section-icon"
          style={{ background: 'var(--surface2)', textDecoration: 'none' }}
          aria-label="Back to folders"
        >
          ←
        </Link>
        <div>
          <div className="section-title">{name}</div>
          <div className="section-sub">{images.length} photo{images.length === 1 ? '' : 's'}</div>
        </div>
      </div>
      <GalleryImages images={images} folderId={folderId} />
    </div>
  );
}
