'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  createGalleryFolderAction,
  createGalleryImageAction,
  deleteGalleryFolderAction,
  deleteGalleryImageAction,
} from '@/app/actions';
import { auth, classifyFileUrl, galleryStorage, resolveImageUrl } from '@/lib/supabase';
import { useMobileAction } from '@/lib/mobile-actions';
import { FolderIcon } from '@/components/icons';
import { useRouter } from 'next/navigation';
import MobileSheet from '@/components/MobileSheet';
import Sheet from '@/components/Sheet';

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
  /** True when the stored ref points at the dead previous project (re-upload needed). */
  stale?: boolean;
}

interface GalleryFoldersProps {
  folders: GalleryFolder[];
  onRefresh?: () => void;
}

/** Folder creation form shared by the desktop panel and the mobile 📁 FAB sheet. */
export function FolderCreateForm({ onCreated }: { onCreated?: (folder: GalleryFolder) => void }) {
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
      const result = await createGalleryFolderAction(newFolderName.trim());
      if (!result.success) {
        throw new Error(result.error || 'Failed to create folder');
      }
      const createdRow = (
        Array.isArray(result.data) ? result.data[0] : result.data
      ) as { id?: unknown; name?: unknown; created_at?: unknown } | null | undefined;
      setNewFolderName('');
      onCreated?.({
        id: String(createdRow?.id || `local-${Date.now()}`),
        name: String(createdRow?.name || newFolderName.trim()),
        created_at: String((createdRow as { created_at?: unknown } | null | undefined)?.created_at || new Date().toISOString()),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create folder');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="folder-create">
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

export function GalleryFolders({ folders, onRefresh }: GalleryFoldersProps) {
  const [folderSheetOpen, setFolderSheetOpen] = useState(false);
  // Session-created folders appear instantly; duplicates drop once server props arrive.
  const [freshFolders, setFreshFolders] = useState<GalleryFolder[]>([]);
  const displayFolders = useMemo(() => {
    const seen = new Set(folders.map((f) => f.id));
    return [...freshFolders.filter((f) => !seen.has(f.id)), ...folders];
  }, [freshFolders, folders]);
  const handleCreated = (folder: GalleryFolder) => {
    setFreshFolders((prev) => [folder, ...prev]);
    onRefresh?.();
  };
  const handleDeleted = (id: string) => {
    setFreshFolders((prev) => prev.filter((f) => f.id !== id));
    onRefresh?.();
  };

  // Mobile 📁 FAB -> bottom-sheet folder composer (desktop keeps the inline form)
  useMobileAction(
    'composer:folder',
    React.useCallback(() => setFolderSheetOpen(true), []),
  );

  return (
    <div>
      {displayFolders.length === 0 ? (
        <div className="empty-state" style={{ marginBottom: '16px' }}>
          <div className="empty-icon">📁</div>
          <p>No folders yet</p>
          <span>Create your first folder to start organizing photos.</span>
        </div>
      ) : (
        <div className="folder-grid">
          {displayFolders.map((folder) => (
            <GalleryFolderCard
              key={folder.id}
              folder={folder}
              onDelete={handleDeleted}
            />
          ))}
        </div>
      )}

      {/* Desktop inline form — hidden on mobile, replaced by the 📁 FAB sheet */}
      <div className="hide-mobile">
        <FolderCreateForm onCreated={handleCreated} />
      </div>

      {folderSheetOpen ? (
        <MobileSheet title="📁 New Folder" onClose={() => setFolderSheetOpen(false)}>
          <FolderCreateForm
            onCreated={(folder) => {
              setFolderSheetOpen(false);
              handleCreated(folder);
            }}
          />
        </MobileSheet>
      ) : null}
    </div>
  );
}

interface GalleryFolderCardProps {
  folder: GalleryFolder;
  onDelete: (id: string) => void;
}

export function GalleryFolderCard({ folder, onDelete }: GalleryFolderCardProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteGalleryFolderAction(folder.id);
      onDelete(folder.id);
      router.refresh();
    } catch (error) {
      console.error('Failed to delete:', error);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {/* Tapping a folder opens it as its own page: /dashboard/gallery/[folderId] */}
      <Link href={`/dashboard/gallery/${folder.id}`} prefetch className="folder-card" aria-label={`Open ${folder.name}`}>
        <div className="folder-icon"><FolderIcon /></div>
        <div className="folder-name">{folder.name}</div>
        <button
          type="button"
          aria-label={`Delete folder ${folder.name}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setConfirmOpen(true);
          }}
          disabled={deleting}
          className="btn-delete"
        >
          {deleting ? '...' : '✕'}
        </button>
      </Link>
      {confirmOpen ? (
        <Sheet
          title="Delete this folder?"
          description={`"${folder.name}" and all its images will be removed. This can't be undone.`}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            void handleDelete();
          }}
        />
      ) : null}
    </>
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
  const uploadInputRef = useRef<HTMLInputElement>(null);
  // Session-added images render instantly (prepended) while the server
  // round-trip completes; duplicates drop out once server props arrive.
  const [freshImages, setFreshImages] = useState<GalleryImage[]>([]);
  const displayImages = useMemo(() => {
    const seen = new Set(images.map((i) => i.id));
    return [...freshImages.filter((f) => !seen.has(f.id)), ...images];
  }, [freshImages, images]);

  const openCamera = React.useCallback(() => {
    setCameraError('');
    setFacingMode('environment');
    setCameraOpen(true);
  }, []);

  // Mobile FABs (📷 camera / 🖼️ upload inside a folder)
  useMobileAction('gallery:camera', openCamera);
  useMobileAction(
    'gallery:upload',
    React.useCallback(() => {
      uploadInputRef.current?.click();
    }, []),
  );

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

      // Private bucket: upload returns the object path, stored in `file_url`.
      const storagePath = await galleryStorage.upload(file, user.id, folderId);
      const result = await createGalleryImageAction(folderId, storagePath, file.name);
      if (!result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      // Show it NOW with a client-signed URL; server data replaces it on refresh.
      const createdRow = (
        Array.isArray(result.data) ? result.data[0] : result.data
      ) as { id?: unknown; title?: unknown } | null | undefined;
      const signed = await resolveImageUrl(storagePath);
      const newId = String(createdRow?.id || `local-${Date.now()}`);
      setFreshImages((prev) => [
        {
          id: newId,
          file_url: signed,
          title: String(createdRow?.title || file.name),
          uploaded_at: new Date().toISOString(),
          folder_id: folderId,
        },
        ...prev,
      ]);

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
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera not supported in this browser. Use the 🖼️ upload button instead.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      if (cameraError) setCameraError('');
    } catch (err) {
      const name = (err as { name?: string } | null)?.name || '';
      setCameraError(
        name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera access, or use the 🖼️ upload button.'
          : name === 'NotFoundError'
            ? 'No camera found on this device. Use the 🖼️ upload button.'
            : 'Camera unavailable. Ensure the page is served over HTTPS and camera permission is granted.',
      );
    }
  };

  const closeCamera = () => {
    stopStream();
    setCameraOpen(false);
  };

  useEffect(() => {
    if (!cameraOpen) return;
    document.body.style.overflow = 'hidden';
    // eslint-disable-next-line react-hooks/set-state-in-effect
    initCamera(facingMode);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCamera();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      stopStream();
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
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
      closeCamera();
    }, 'image/jpeg', 0.92);
  };

  return (
    <div>
      {/* Hidden pickers stay mounted so the mobile FABs can trigger them */}
      <input
        ref={uploadInputRef}
        type="file"
        multiple
        accept=".png,.jpg,.jpeg,image/png,image/jpeg"
        onChange={(e) => {
          Array.from(e.target.files || []).forEach(handleImageUpload);
          e.target.value = '';
        }}
        style={{ display: 'none' }}
        id="image-upload"
        aria-hidden="true"
        tabIndex={-1}
      />
      {/* Native camera fallback: on mobile this opens the camera app directly */}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          Array.from(e.target.files || []).forEach(handleImageUpload);
          e.target.value = '';
        }}
        style={{ display: 'none' }}
        id="image-capture"
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Desktop upload UI — hidden on mobile, replaced by the 🖼️/📷 FABs */}
      <div className="upload-zone hide-mobile">
        <label htmlFor="image-upload" className="upload-label">
          <div className="upload-icon">📸</div>
          <div className="upload-text">
            <p>Upload to selected folder</p>
            <span>{uploading ? 'Uploading...' : 'Click or drag images here'}</span>
          </div>
        </label>
      </div>

      <div className="gallery-actions-mobile hide-mobile">
        <button
          type="button"
          className="btn-primary gallery-action-btn"
          onClick={openCamera}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
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
              style={{ width: '100%', maxHeight: '60dvh', borderRadius: 'var(--radius-sm)', background: '#000', objectFit: 'contain' }}
            />
            <div className="camera-controls">
              <button type="button" className="btn-primary" onClick={() => initCamera(facingMode === 'environment' ? 'user' : 'environment')}>
                🔄 Flip Camera
              </button>
              <button type="button" className="btn-primary" onClick={capturePhoto} disabled={uploading}>
                {uploading ? 'Saving...' : '📸 Capture'}
              </button>
            </div>
            <p className="section-sub" style={{ marginTop: '10px' }}>
              No camera? Use the file picker above — on mobile it opens the camera app directly.
            </p>
          </div>
        </div>
      ) : null}

      {error ? <p className="section-sub" style={{ color: 'var(--text)', marginBottom: '10px' }}>{error}</p> : null}

      {displayImages.length > 0 ? (
        <div className="photo-grid">
          {displayImages.map((image) => (
            <GalleryImageCard
              key={image.id}
              image={image}
              onDelete={(id) => {
                // Vanish instantly; server refresh confirms.
                setFreshImages((prev) => prev.filter((f) => f.id !== id));
                onRefresh?.();
              }}
            />
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
  onDelete: (id: string) => void;
}

export function GalleryImageCard({ image, onDelete }: GalleryImageCardProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Rows pointing at a previous (dead) Supabase project can never load —
  // don't even attempt the request, show the re-upload placeholder instead.
  // `stale` arrives pre-computed from the server; the client check covers
  // absolute URLs that bypassed server signing (e.g. optimistic refreshes).
  const isStale = image.stale === true || classifyFileUrl(image.file_url) === 'stale';
  const showPlaceholder = !image.file_url || imgBroken || isStale;
  // Masonry rhythm: deterministic fallback ratio per photo + intrinsic ratio
  // once the real file loads. The card reports a ratio bucket; CSS grid spans
  // by bucket so placement flows row-major (newest across each row).
  const [naturalRatio, setNaturalRatio] = useState<string | null>(null);
  const fallbackRatio = useMemo(() => {
    const ratios = ['3 / 4', '1 / 1', '4 / 5', '3 / 4', '1 / 1', '4 / 3'];
    let hash = 0;
    for (const c of image.id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
    return ratios[hash % ratios.length];
  }, [image.id]);
  const ratioBucket = useMemo(() => {
    const [w, h] = (naturalRatio ?? fallbackRatio).split('/').map(Number);
    const r = w && h ? w / h : 1;
    if (r >= 1.15) return 'landscape';
    if (r >= 0.9) return 'square';
    if (r >= 0.7) return 'portrait';
    return 'tall';
  }, [naturalRatio, fallbackRatio]);

  useEffect(() => {
    if (!lightbox) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [lightbox]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteGalleryImageAction(image.id);
      onDelete(image.id);
      router.refresh();
    } catch (error) {
      console.error('Failed to delete:', error);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div
        className="photo-card"
        data-ratio={ratioBucket}
        onClick={() => !showPlaceholder && image.file_url && setLightbox(true)}
      >
        {!showPlaceholder && image.file_url ? (
          <Image
            src={image.file_url}
            alt={image.title || 'Photo'}
            width={800}
            height={1000}
            sizes="(max-width: 860px) 50vw, (max-width: 1024px) 33vw, 25vw"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            unoptimized
            onError={() => setImgBroken(true)}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                setNaturalRatio(`${img.naturalWidth} / ${img.naturalHeight}`);
              }
            }}
          />
        ) : (
          <div className="photo-placeholder" style={{ height: '100%', minHeight: '120px' }}>
            🖼️<span>{isStale ? 'Old storage — re-upload this photo' : imgBroken ? 'Could not load — check bucket is Public' : image.title || 'Image'}</span>
          </div>
        )}
        <div className="photo-overlay">
          <button
            type="button"
            className="btn-delete photo-delete-btn"
            aria-label="Delete image"
            onClick={(e) => { e.stopPropagation(); setConfirmOpen(true); }}
            disabled={deleting}
            style={{ fontSize: '20px', padding: '8px', minWidth: '44px', minHeight: '44px' }}
          >
            {deleting ? '...' : '✕'}
          </button>
        </div>
      </div>
      {confirmOpen ? (
        <Sheet
          title="Delete this image?"
          description="The photo will be removed permanently. This can't be undone."
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            void handleDelete();
          }}
        />
      ) : null}

      {lightbox && image.file_url && !imgBroken ? (
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
            <Image
              src={image.file_url}
              alt={image.title || 'Photo'}
              width={1600}
              height={1600}
              sizes="96vw"
              unoptimized
              onError={() => {
                setImgBroken(true);
                setLightbox(false);
              }}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}


