'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  createGalleryFolderAction,
  createGalleryImageAction,
  deleteGalleryFolderAction,
  deleteGalleryImageAction,
} from '@/app/actions';
import { auth, galleryStorage } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

interface GalleryFolder {
  id: string;
  name: string;
  created_at: string;
}

interface GalleryImage {
  id: string;
  file_url: string | null;
  title: string;
  uploaded_at: string | null;
  folder_id?: string | null;
}

interface GalleryFoldersProps {
  folders: GalleryFolder[];
  onFolderSelect?: (folderId: string) => void;
  onRefresh?: () => void;
  activeFolderId?: string | null;
}

export function GalleryFolders({ folders, onFolderSelect, onRefresh, activeFolderId }: GalleryFoldersProps) {
  const router = useRouter();
  const [newFolderName, setNewFolderName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      setError('Folder name required');
      return;
    }

    setCreating(true);
    setError('');

    try {
      await createGalleryFolderAction(newFolderName.trim());
      setNewFolderName('');
      onRefresh?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create folder');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div className="folder-grid">
        {folders.map((folder) => (
          <GalleryFolderCard
            key={folder.id}
            folder={folder}
            active={folder.id === activeFolderId}
            onSelect={() => onFolderSelect?.(folder.id)}
            onDelete={() => onRefresh?.()}
          />
        ))}
      </div>

      <label className="field-label">New Folder</label>
      <input
        type="text"
        value={newFolderName}
        onChange={(e) => setNewFolderName(e.target.value)}
        placeholder="Folder name..."
        className="field-input"
      />
      {error ? <p className="section-sub" style={{ color: 'var(--text)', marginBottom: '10px' }}>{error}</p> : null}
      <button type="button" onClick={handleCreateFolder} disabled={creating} className="btn-primary cyan">
        {creating ? 'Creating...' : 'Create Folder'}
      </button>
    </div>
  );
}

interface GalleryFolderCardProps {
  folder: GalleryFolder;
  onSelect: () => void;
  onDelete: () => void;
  active?: boolean;
}

export function GalleryFolderCard({ folder, onSelect, onDelete, active }: GalleryFolderCardProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm('Delete this folder and all images?')) return;
    setDeleting(true);
    try {
      await deleteGalleryFolderAction(folder.id);
      onDelete();
      router.refresh();
    } catch (error) {
      console.error('Failed to delete:', error);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div onClick={onSelect} className={`folder-card${active ? ' active' : ''}`}>
      <div className="folder-icon">📁</div>
      <div className="folder-name">{folder.name}</div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleDelete();
        }}
        disabled={deleting}
        className="btn-delete"
        style={{ marginTop: '8px' }}
      >
        {deleting ? '...' : '✕'}
      </button>
    </div>
  );
}

interface GalleryImagesProps {
  images: GalleryImage[];
  folderId?: string;
  onRefresh?: () => void;
}

const ALLOWED_IMAGE_TYPES = ['.png', '.jpg', '.jpeg'];

export function GalleryImages({ images, folderId, onRefresh }: GalleryImagesProps) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const handleImageUpload = async (file: File) => {
    if (!folderId) {
      setError('Select a folder first');
      return;
    }

    const ext = file.name.toLowerCase().match(/\.[^./\\]+$/)?.[0] || '';
    if (!ALLOWED_IMAGE_TYPES.includes(ext)) {
      setError('Only PNG and JPG/JPEG images are allowed');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const user = await auth.getUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      const publicUrl = await galleryStorage.upload(file, user.id, folderId);
      const result = await createGalleryImageAction(folderId, publicUrl, file.name);
      if (!result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      onRefresh?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const initCamera = async (mode: 'environment' | 'user') => {
    try {
      stopStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraError('');
    } catch (err) {
      setCameraError(
        'Camera unavailable. Ensure the page is served over HTTPS and camera permission is granted.',
      );
    }
  };

  useEffect(() => {
    if (!cameraOpen) return;
    initCamera(facingMode);
    return stopStream;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen]);

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setCameraError('Camera is not ready yet.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
      await handleImageUpload(file);
    }, 'image/jpeg', 0.92);
  };

  const closeCamera = () => {
    stopStream();
    setCameraOpen(false);
  };

  return (
    <div>
      <div className="upload-zone">
        <input
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,image/png,image/jpeg"
          onChange={(e) => {
            Array.from(e.target.files || []).forEach(handleImageUpload);
          }}
          style={{ display: 'none' }}
          id="image-upload"
        />
        <label htmlFor="image-upload" style={{ cursor: 'pointer', display: 'block' }}>
          <div className="upload-icon">📸</div>
          <p>Upload to selected folder</p>
          <span>{uploading ? 'Uploading...' : 'Click or drag images here'}</span>
        </label>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <button type="button" className="btn-primary" onClick={() => { setCameraError(''); setFacingMode('environment'); setCameraOpen(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          📷 Take Photo with Camera
        </button>
      </div>

      {cameraOpen ? (
        <div className="expand-overlay" onClick={() => !uploading && closeCamera()}>
          <button
            type="button"
            className="expand-close"
            aria-label="Close"
            onClick={() => !uploading && closeCamera()}
          >
            ✕
          </button>
          <div className="camera-view" onClick={(e) => e.stopPropagation()}>
            <div className="camera-title">📷 Live Camera</div>
            {cameraError ? <p className="section-sub" style={{ color: 'var(--text)', marginBottom: '10px' }}>{cameraError}</p> : null}
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              style={{ width: '100%', maxHeight: '50vh', borderRadius: 'var(--radius-sm)', background: '#000', objectFit: 'cover' }}
            />
            <div className="camera-controls">
              <button type="button" className="btn-primary" onClick={() => initCamera(facingMode === 'environment' ? 'user' : 'environment')}>
                🔄 Flip Camera
              </button>
              <button type="button" className="btn-primary" onClick={capturePhoto} disabled={uploading}>
                {uploading ? 'Saving...' : '📸 Capture'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error ? <p className="section-sub" style={{ color: 'var(--text)', marginBottom: '10px' }}>{error}</p> : null}

      {images.length > 0 ? (
        <div className="photo-grid">
          {images.map((image) => (
            <GalleryImageCard key={image.id} image={image} onDelete={() => onRefresh?.()} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">🖼️</div>
          <p>No photos in this folder yet.</p>
          <span>Upload your first image.</span>
        </div>
      )}
    </div>
  );
}

interface GalleryImageCardProps {
  image: GalleryImage;
  onDelete: () => void;
}

export function GalleryImageCard({ image, onDelete }: GalleryImageCardProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  const handleDelete = async () => {
    if (!confirm('Delete this image?')) return;
    setDeleting(true);
    try {
      await deleteGalleryImageAction(image.id);
      onDelete();
      router.refresh();
    } catch (error) {
      console.error('Failed to delete:', error);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="photo-card" onClick={() => image.file_url && setLightbox(true)}>
        {image.file_url ? (
          <Image src={image.file_url} alt={image.title || 'Photo'} width={800} height={800} style={{ width: '100%', height: '100%', objectFit: 'cover' }} unoptimized />
        ) : (
          <div className="photo-placeholder">🖼️<span>{image.title || 'Image'}</span></div>
        )}
        <div className="photo-overlay">
          <button type="button" className="btn-delete" onClick={(e) => { e.stopPropagation(); handleDelete(); }} disabled={deleting}>
            {deleting ? '...' : '✕'}
          </button>
        </div>
      </div>

      {lightbox && image.file_url ? (
        <div className="expand-overlay" onClick={() => setLightbox(false)}>
          <button
            type="button"
            className="expand-close"
            aria-label="Close"
            onClick={() => setLightbox(false)}
          >
            ✕
          </button>
          <div className="expand-lightbox" onClick={(e) => e.stopPropagation()}>
            <Image src={image.file_url} alt={image.title || 'Photo'} width={1600} height={1600} unoptimized />
          </div>
        </div>
      ) : null}
    </>
  );
}

interface GalleryWorkspaceProps {
  folders: GalleryFolder[];
  images: GalleryImage[];
}

export function GalleryWorkspace({ folders, images }: GalleryWorkspaceProps) {
  const initialFolderId = folders[0]?.id ?? null;
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(initialFolderId);

  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId) ?? null,
    [folders, selectedFolderId],
  );

  const selectedImages = useMemo(
    () => (selectedFolderId ? images.filter((image) => image.folder_id === selectedFolderId) : []),
    [images, selectedFolderId],
  );

  return (
    <div className="gallery-layout">
      <div className="panel">
        <div className="panel-title">📁 Folders</div>
        <GalleryFolders
          folders={folders}
          activeFolderId={selectedFolderId}
          onFolderSelect={setSelectedFolderId}
        />
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
            {selectedFolder ? `${selectedFolder.name} Photos` : 'Photos'}
          </span>
          <span className="badge badge-cyan">{selectedImages.length} photos</span>
        </div>
        <GalleryImages images={selectedImages} folderId={selectedFolderId ?? undefined} />
      </div>
    </div>
  );
}
