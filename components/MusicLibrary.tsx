'use client';

import React, { useCallback, useState } from 'react';
import { useMusic, type MusicTrack } from '@/contexts/MusicContext';
import { createMusicTrackAction, deleteMusicTrackAction } from '@/app/actions';
import { auth, musicStorage } from '@/lib/supabase';
import { useMobileAction } from '@/lib/mobile-actions';
import MobileSheet from '@/components/MobileSheet';
import Sheet from '@/components/Sheet';

function formatDuration(seconds: number) {
  if (!seconds || Number.isNaN(seconds)) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function titleFromFileName(fileName: string, index: number) {
  const withoutExtension = fileName.replace(/\.[^/.]+$/, '').trim();
  return withoutExtension || `Track ${index + 1}`;
}

/**
 * Upload form shared by the desktop sidebar panel and the mobile bottom-sheet.
 * On success calls onDone (mobile sheet closes itself).
 */
export function MusicUploadForm({ onDone }: { onDone?: () => void }) {
  const { refreshTracks, upsertTrack } = useMusic();

  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [inputKey, setInputKey] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<{ currentIndex: number; uploaded: number; total: number; fileName: string } | null>(null);

  const selectedFilesLabel =
    files.length === 0
      ? 'Choose one or more audio files'
      : files.length === 1
        ? files[0].name
        : `${files.length} files selected`;

  const handleUpload = async () => {
    if (files.length === 0) {
      setUploadError('Choose one or more MP3 files to upload');
      return;
    }

    const invalid = files.filter((f) => !f.name.toLowerCase().endsWith('.mp3'));
    if (invalid.length > 0) {
      setUploadError('Only MP3 files are allowed');
      return;
    }

    setUploading(true);
    setUploadError('');
    setUploadProgress({ currentIndex: 1, uploaded: 0, total: files.length, fileName: files[0]?.name || '' });

    try {
      const user = await auth.getUser();
      if (!user) throw new Error('Not authenticated');

      for (const [index, file] of files.entries()) {
        setUploadProgress({ currentIndex: index + 1, uploaded: index, total: files.length, fileName: file.name });
        // Private bucket: upload returns the object path stored in `file_url`.
        const storagePath = await musicStorage.upload(file, user.id);
        const result = await createMusicTrackAction(
          titleFromFileName(file.name, index),
          'Unknown Artist',
          storagePath,
        );

        if (!result.success) {
          throw new Error(result.error || `Upload failed for ${file.name}`);
        }

        setUploadProgress({ currentIndex: index + 1, uploaded: index + 1, total: files.length, fileName: file.name });

        const createdRow = Array.isArray(result.data) ? result.data[0] : result.data;
        const createdTrack: MusicTrack = {
          id: String((createdRow as { id?: unknown } | null | undefined)?.id || `${Date.now()}-${index}`),
          title: String((createdRow as { title?: unknown } | null | undefined)?.title || titleFromFileName(file.name, index)),
          artist: String((createdRow as { artist?: unknown } | null | undefined)?.artist || 'Unknown Artist'),
          file_url: String((createdRow as { file_url?: unknown; url?: unknown; filePath?: unknown } | null | undefined)?.file_url || (createdRow as { url?: unknown } | null | undefined)?.url || (createdRow as { filePath?: unknown } | null | undefined)?.filePath || storagePath),
          duration: Number((createdRow as { duration?: unknown } | null | undefined)?.duration) || 0,
          created_at: String((createdRow as { created_at?: unknown; uploaded_at?: unknown } | null | undefined)?.created_at || (createdRow as { uploaded_at?: unknown } | null | undefined)?.uploaded_at || new Date().toISOString()),
        };

        upsertTrack(createdTrack);
        void refreshTracks();
      }

      setFiles([]);
      setInputKey((value) => value + 1);
      onDone?.();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadProgress(null);
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="field-label">Audio file (MP3 only)</label>
      <input
        key={inputKey}
        type="file"
        accept=".mp3,audio/mpeg"
        multiple
        onChange={(e) => {
          const selected = Array.from(e.target.files ?? []);
          const invalid = selected.filter((f) => !f.name.toLowerCase().endsWith('.mp3'));
          if (invalid.length > 0) {
            setUploadError('Only MP3 files are allowed');
            setFiles([]);
            return;
          }
          setFiles(selected);
        }}
        className="field-input"
        style={{ padding: '8px 12px', fontSize: '14px', cursor: 'pointer' }}
      />

      <p className="section-sub" style={{ marginBottom: '10px' }}>
        {selectedFilesLabel}
      </p>

      {uploadError ? <p className="section-sub" style={{ color: 'var(--text)', marginBottom: '10px' }}>{uploadError}</p> : null}

      {uploadProgress ? (
        <div style={{ marginBottom: '10px', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid #ffffff44', background: 'rgba(255,255,255,0.04)' }}>
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
            Uploading {uploadProgress.currentIndex}/{uploadProgress.total}
          </p>
          <p style={{ fontSize: '14px', color: 'var(--text2)' }}>{uploadProgress.fileName}</p>
          <p style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '4px' }}>
            {uploadProgress.uploaded}/{uploadProgress.total} added to playlist
          </p>
        </div>
      ) : null}

      <button type="button" onClick={handleUpload} disabled={uploading || files.length === 0} className="btn-primary">
        {uploading ? 'Uploading...' : files.length > 1 ? `Upload ${files.length} Tracks` : 'Upload Track'}
      </button>
    </div>
  );
}

export default function MusicLibrary() {
  const { tracks, staleTracks, currentTrack, isPlaying, loading, error, playTrack, togglePlay, refreshTracks, stop, removeStaleTracks } = useMusic();

  const [actionError, setActionError] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingMoreId, setPendingMoreId] = useState<string | null>(null);
  const [confirmClearStale, setConfirmClearStale] = useState(false);
  const [clearingStale, setClearingStale] = useState(false);
  const [uploadSheetOpen, setUploadSheetOpen] = useState(false);

  // Mobile FAB -> bottom-sheet uploader (desktop keeps the sidebar panel)
  useMobileAction(
    'composer:music',
    useCallback(() => setUploadSheetOpen(true), []),
  );

  const hasTracks = tracks.length > 0;

  const handleDeleteTrack = async (trackId: string) => {
    try {
      if (currentTrack?.id === trackId) {
        stop();
      }

      const result = await deleteMusicTrackAction(trackId);
      if (!result.success) {
        throw new Error(result.error || 'Delete failed');
      }

      void refreshTracks();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleClearStale = async () => {
    if (staleTracks.length === 0) return;
    setClearingStale(true);
    try {
      for (const track of staleTracks) {
        const result = await deleteMusicTrackAction(track.id);
        if (!result.success) {
          throw new Error(result.error || `Failed to remove "${track.title}"`);
        }
      }
      removeStaleTracks();
      void refreshTracks();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove old entries');
    } finally {
      setClearingStale(false);
    }
  };

  return (
    <div className="music-layout">
      {/* Desktop sidebar — hidden on mobile, replaced by the 🎵 FAB bottom-sheet */}
      <div className="panel hide-mobile">
        <div className="panel-title">☁️ Upload Track</div>
        <MusicUploadForm />

        {currentTrack ? (
          <div style={{ marginTop: '16px', padding: '14px', borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.04)', border: '1px solid #ffffff44' }}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>Now Playing</p>
            <p style={{ fontSize: '15px', color: 'var(--text2)' }}>{currentTrack.title}</p>
            <p style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '4px' }}>
              Use the player above to control playback from any page
            </p>
          </div>
        ) : null}
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <span style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text)' }}>Your tracks</span>
          <span className="badge badge-purple">{tracks.length} tracks</span>
        </div>

        {loading ? <div className="empty-state"><p>Loading your music...</p></div> : null}
        {!loading && (error || actionError) ? <div className="empty-state"><p>{error || actionError}</p></div> : null}

        {!loading && staleTracks.length > 0 ? (
          <div className="empty-state" style={{ marginBottom: '12px', borderColor: '#b3261e66' }}>
            <p>⚠️ {staleTracks.length} track{staleTracks.length === 1 ? '' : 's'} point at old storage</p>
            <span>
              The project moved to a new Supabase backend and those files were never migrated,
              so they can&apos;t load. Re-upload the MP3s (upload panel, or the 🎵 button on mobile),
              then remove the old entries.
            </span>
            <button
              type="button"
              className="btn-primary sheet-confirm"
              disabled={clearingStale}
              onClick={() => setConfirmClearStale(true)}
              style={{ marginTop: '12px', maxWidth: '280px' }}
            >
              {clearingStale ? 'Removing...' : `Remove ${staleTracks.length} old ${staleTracks.length === 1 ? 'entry' : 'entries'}`}
            </button>
          </div>
        ) : null}

        {!loading && !hasTracks && !error ? (
          <div className="empty-state">
            <div className="empty-icon">🎵</div>
            <p>No music yet</p>
            <span>Upload a track to start playing.</span>
          </div>
        ) : null}

        {!loading && hasTracks ? (
          <div className="track-list">
            {tracks.map((track) => {
              const active = currentTrack?.id === track.id;
              return (
                <div
                  key={track.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => playTrack(track)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      playTrack(track);
                    }
                  }}
                  className={`track-card${active ? ' playing' : ''}`}
                >
                  <div className="track-art" aria-hidden="true">
                    {active && isPlaying ? (
                      <div className="playing-bars"><div className="bar" /><div className="bar" /><div className="bar" /></div>
                    ) : (
                      '♪'
                    )}
                  </div>
                  <div className="track-info">
                    <p>{track.title || 'Untitled'}</p>
                    <span>{track.artist || 'Unknown Artist'} • {formatDuration(track.duration ?? 0)}</span>
                  </div>
                  <button
                    type="button"
                    aria-label={`Options for ${track.title || 'track'}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setPendingMoreId(track.id);
                    }}
                    className="track-more"
                  >
                    ⋯
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
      {pendingMoreId ? (() => {
        const moreTrack = tracks.find((t) => t.id === pendingMoreId);
        if (!moreTrack) return null;
        const isCurrent = currentTrack?.id === moreTrack.id && isPlaying;
        return (
          <MobileSheet title={moreTrack.title || 'Untitled'} onClose={() => setPendingMoreId(null)}>
            <p className="section-sub" style={{ marginBottom: '12px' }}>
              {moreTrack.artist || 'Unknown Artist'} • {formatDuration(moreTrack.duration ?? 0)}
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setPendingMoreId(null);
                if (currentTrack?.id === moreTrack.id) togglePlay();
                else playTrack(moreTrack);
              }}
              style={{ marginBottom: '10px' }}
            >
              {isCurrent ? '⏸ Pause' : '▶ Play'}
            </button>
            <button
              type="button"
              className="btn-primary sheet-confirm"
              onClick={() => {
                setPendingMoreId(null);
                setPendingDeleteId(moreTrack.id);
              }}
            >
              Delete track
            </button>
          </MobileSheet>
        );
      })() : null}
      {pendingDeleteId ? (
        <Sheet
          title="Delete this track?"
          description="The track will be removed from your library. This can't be undone."
          onClose={() => setPendingDeleteId(null)}
          onConfirm={() => {
            const id = pendingDeleteId;
            setPendingDeleteId(null);
            void handleDeleteTrack(id);
          }}
        />
      ) : null}
      {confirmClearStale ? (
        <Sheet
          title={`Remove ${staleTracks.length} old entries?`}
          description="Only the broken database entries are deleted. Re-upload the MP3s first if you still have the files — they can't be recovered from old storage."
          confirmLabel={clearingStale ? 'Removing...' : 'Remove all'}
          onClose={() => setConfirmClearStale(false)}
          onConfirm={() => {
            setConfirmClearStale(false);
            void handleClearStale();
          }}
        />
      ) : null}
      {uploadSheetOpen ? (
        <MobileSheet title="🎵 Upload Track" onClose={() => setUploadSheetOpen(false)}>
          <MusicUploadForm onDone={() => setUploadSheetOpen(false)} />
        </MobileSheet>
      ) : null}
    </div>
  );
}
