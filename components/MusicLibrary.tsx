'use client';

import React, { useState } from 'react';
import { useMusic } from '@/contexts/MusicContext';
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
  const { tracks, currentTrack, isPlaying, loading, error, playTrack, refreshTracks, stop } = useMusic();

  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [inputKey, setInputKey] = useState(0);

  const hasTracks = tracks.length > 0;

  const selectedFilesLabel =
    files.length === 0
      ? 'Choose one or more audio files'
      : files.length === 1
        ? files[0].name
        : `${files.length} files selected`;

  const handleUpload = async () => {
    if (files.length === 0) {
      setUploadError('Choose one or more audio files to upload');
      return;
    }

    setUploading(true);
    setUploadError('');

    try {
      const user = await auth.getUser();
      if (!user) throw new Error('Not authenticated');

      for (const [index, file] of files.entries()) {
        const publicUrl = await musicStorage.upload(file, user.id);
        const result = await createMusicTrackAction(
          titleFromFileName(file.name, index),
          'Unknown Artist',
          publicUrl,
        );

        if (!result.success) {
          throw new Error(result.error || `Upload failed for ${file.name}`);
        }
      }

      setFiles([]);
      setInputKey((value) => value + 1);
      await refreshTracks();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
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

      await refreshTracks();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div className="music-layout">
      <div className="panel">
        <div className="panel-title">☁️ Upload Track</div>

        <label className="field-label">Audio file</label>
        <input
          key={inputKey}
          type="file"
          accept="audio/*"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="field-input"
          style={{ padding: '8px 12px', fontSize: '12px', cursor: 'pointer' }}
        />

        <p className="section-sub" style={{ marginBottom: '10px' }}>
          {selectedFilesLabel}
        </p>

        {uploadError ? <p className="section-sub" style={{ color: '#f87171', marginBottom: '10px' }}>{uploadError}</p> : null}

        <button type="button" onClick={handleUpload} disabled={uploading || files.length === 0} className="btn-primary">
          {uploading ? 'Uploading...' : files.length > 1 ? `Upload ${files.length} Tracks` : 'Upload Track'}
        </button>

        {currentTrack ? (
          <div style={{ marginTop: '16px', padding: '14px', borderRadius: 'var(--radius-sm)', background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#c084fc', marginBottom: '4px' }}>Now Playing</p>
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

        {loading ? <div className="empty-state"><p>Loading your music...</p></div> : null}
        {!loading && (error || uploadError) ? <div className="empty-state"><p>{error || uploadError}</p></div> : null}

        {!loading && !hasTracks && !error ? (
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
