'use client';

import React, { useState } from 'react';
import { useMusic, type MusicTrack } from '@/contexts/MusicContext';
import { createMusicTrackAction, deleteMusicTrackAction } from '@/app/actions';
import { auth, musicStorage } from '@/lib/supabase';

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

export default function MusicLibrary() {
  const { tracks, currentTrack, isPlaying, loading, error, playTrack, refreshTracks, upsertTrack, stop } = useMusic();

  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [inputKey, setInputKey] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<{ currentIndex: number; uploaded: number; total: number; fileName: string } | null>(null);

  const hasTracks = tracks.length > 0;

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
        const publicUrl = await musicStorage.upload(file, user.id);
        const result = await createMusicTrackAction(
          titleFromFileName(file.name, index),
          'Unknown Artist',
          publicUrl,
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
          file_url: String((createdRow as { file_url?: unknown; url?: unknown; filePath?: unknown } | null | undefined)?.file_url || (createdRow as { url?: unknown } | null | undefined)?.url || (createdRow as { filePath?: unknown } | null | undefined)?.filePath || publicUrl),
          duration: Number((createdRow as { duration?: unknown } | null | undefined)?.duration) || 0,
          created_at: String((createdRow as { created_at?: unknown; uploaded_at?: unknown } | null | undefined)?.created_at || (createdRow as { uploaded_at?: unknown } | null | undefined)?.uploaded_at || new Date().toISOString()),
        };

        upsertTrack(createdTrack);
        void refreshTracks();
      }

      setFiles([]);
      setInputKey((value) => value + 1);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadProgress(null);
      setUploading(false);
    }
  };

  const handleDeleteTrack = async (trackId: string) => {
    if (!confirm('Delete this track?')) return;

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
      setUploadError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div className="music-layout">
      <div className="panel">
        <div className="panel-title">☁️ Upload Track</div>

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
          style={{ padding: '8px 12px', fontSize: '12px', cursor: 'pointer' }}
        />

        <p className="section-sub" style={{ marginBottom: '10px' }}>
          {selectedFilesLabel}
        </p>

        {uploadError ? <p className="section-sub" style={{ color: 'var(--text)', marginBottom: '10px' }}>{uploadError}</p> : null}

        {uploadProgress ? (
          <div style={{ marginBottom: '10px', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid #ffffff44', background: 'rgba(255,255,255,0.04)' }}>
            <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
              Uploading {uploadProgress.currentIndex}/{uploadProgress.total}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text2)' }}>{uploadProgress.fileName}</p>
            <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
              {uploadProgress.uploaded}/{uploadProgress.total} added to playlist
            </p>
          </div>
        ) : null}

        <button type="button" onClick={handleUpload} disabled={uploading || files.length === 0} className="btn-primary">
          {uploading ? 'Uploading...' : files.length > 1 ? `Upload ${files.length} Tracks` : 'Upload Track'}
        </button>

        {currentTrack ? (
          <div style={{ marginTop: '16px', padding: '14px', borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.04)', border: '1px solid #ffffff44' }}>
            <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>Now Playing</p>
            <p style={{ fontSize: '13px', color: 'var(--text2)' }}>{currentTrack.title}</p>
            <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
              Use the player above to control playback from any page
            </p>
          </div>
        ) : null}
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>Your tracks</span>
          <span className="badge badge-purple">{tracks.length} tracks</span>
        </div>

        {loading && !uploading ? <div className="empty-state"><p>Loading your music...</p></div> : null}
        {!loading && (error || uploadError) ? <div className="empty-state"><p>{error || uploadError}</p></div> : null}

        {uploading ? (
          <div className="empty-state" style={{ marginBottom: '12px' }}>
            <p>Refreshing playlist live</p>
            <span>
              {uploadProgress
                ? `${uploadProgress.uploaded}/${uploadProgress.total} uploaded`
                : 'Preparing upload...'}
            </span>
          </div>
        ) : null}

        {!loading && !uploading && !hasTracks && !error ? (
          <div className="empty-state">
            <div className="empty-icon">🎵</div>
            <p>No music yet</p>
            <span>Upload a track to start playing.</span>
          </div>
        ) : null}

        {!loading && hasTracks ? (
          <div className="track-list">
            {tracks.map((track, index) => {
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
                  <div className="track-num">
                    {active && isPlaying ? (
                      <div className="playing-bars"><div className="bar" /><div className="bar" /><div className="bar" /></div>
                    ) : (
                      String(index + 1).padStart(2, '0')
                    )}
                  </div>
                  <div className="track-info">
                    <p>{track.title || 'Untitled'}</p>
                    <span>{track.artist || 'Unknown Artist'}</span>
                  </div>
                  <span className="track-dur">{formatDuration(track.duration ?? 0)}</span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDeleteTrack(track.id);
                    }}
                    className="btn-primary rose"
                    style={{ width: 'auto', padding: '6px 10px', fontSize: '11px', flexShrink: 0 }}
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
