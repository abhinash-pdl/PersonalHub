'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createMusicTrackAction, deleteMusicTrackAction } from '@/app/actions';
import { auth, musicStorage } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

interface MusicTrack {
  id: string;
  title: string;
  file_url: string;
  uploaded_at: string;
}

interface MusicPlayerProps {
  tracks: MusicTrack[];
  onTrackDeleted?: () => void;
}

export function MusicPlayer({ tracks, onTrackDeleted }: MusicPlayerProps) {
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(tracks[0] || null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const handlePlayPause = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleNextTrack = () => {
    if (!currentTrack) return;
    const currentIndex = tracks.findIndex((t) => t.id === currentTrack.id);
    const nextIndex = (currentIndex + 1) % tracks.length;
    setCurrentTrack(tracks[nextIndex]);
    setIsPlaying(true);
  };

  const handlePreviousTrack = () => {
    if (!currentTrack) return;
    const currentIndex = tracks.findIndex((t) => t.id === currentTrack.id);
    const prevIndex = currentIndex === 0 ? tracks.length - 1 : currentIndex - 1;
    setCurrentTrack(tracks[prevIndex]);
    setIsPlaying(true);
  };

  useEffect(() => {
    if (isPlaying && audioRef.current) {
      audioRef.current.play().catch(() => setIsPlaying(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack]);

  if (tracks.length === 0) {
    return (
      <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', padding: 32, textAlign: 'center' }}>
        <p style={{ color: 'var(--text3)', fontSize: 14 }}>No music uploaded yet</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Player */}
      <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', padding: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentTrack?.title}</h3>
          <audio
            ref={audioRef}
            src={currentTrack?.file_url}
            onEnded={handleNextTrack}
            style={{ width: '100%', marginTop: 16 }}
            controls
          />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button
            onClick={handlePreviousTrack}
            style={{ borderRadius: 12, background: 'var(--surface2)', border: '1px solid var(--border)', padding: '8px 16px', color: 'var(--text)', cursor: 'pointer', transition: 'var(--transition)' }}
          >
            ⏮️
          </button>
          <button
            onClick={handlePlayPause}
            style={{ borderRadius: 12, background: '#ffffff', border: 'none', padding: '8px 24px', color: '#000000', fontWeight: 600, cursor: 'pointer', transition: 'var(--transition)' }}
          >
            {isPlaying ? '⏸️ Pause' : '▶️ Play'}
          </button>
          <button
            onClick={handleNextTrack}
            style={{ borderRadius: 12, background: 'var(--surface2)', border: '1px solid var(--border)', padding: '8px 16px', color: 'var(--text)', cursor: 'pointer', transition: 'var(--transition)' }}
          >
            ⏭️
          </button>
        </div>
      </div>

      {/* Playlist */}
      <div style={{ display: 'grid', gap: 8, maxHeight: 256, overflowY: 'auto' }}>
        {tracks.map((track) => (
          <MusicTrackItem
            key={track.id}
            track={track}
            isActive={currentTrack?.id === track.id}
            onSelect={() => {
              setCurrentTrack(track);
              setIsPlaying(true);
            }}
            onDelete={() => onTrackDeleted?.()}
          />
        ))}
      </div>
    </div>
  );
}

interface MusicTrackItemProps {
  track: MusicTrack;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export function MusicTrackItem({ track, isActive, onSelect, onDelete }: MusicTrackItemProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm('Delete this track?')) return;
    setDeleting(true);
    try {
      await deleteMusicTrackAction(track.id);
      onDelete();
      router.refresh();
    } catch (error) {
      console.error('Failed to delete:', error);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      onClick={onSelect}
      style={{
        padding: 12,
        borderRadius: 8,
        border: `1px solid ${isActive ? '#ffffff44' : 'var(--border)'}`,
        background: isActive ? 'rgba(255,255,255,0.06)' : 'var(--surface)',
        cursor: 'pointer',
        transition: 'var(--transition)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}
    >
      <span style={{ fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{track.title}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleDelete();
        }}
        disabled={deleting}
        style={{ 
          background: 'none', 
          border: 'none', 
          color: 'var(--text3)', 
          cursor: 'pointer', 
          fontSize: 12, 
          padding: '2px 6px',
          borderRadius: 4,
          marginLeft: 8,
          flexShrink: 0
        }}
      >
        {deleting ? '...' : '✕'}
      </button>
    </div>
  );
}

interface MusicUploadProps {
  onUploadComplete?: () => void;
}

export function MusicUpload({ onUploadComplete }: MusicUploadProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleUpload = async () => {
    if (!title.trim() || !file) {
      setError('Title and file are required');
      return;
    }

    if (!file.name.toLowerCase().endsWith('.mp3')) {
      setError('Only MP3 files are allowed');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const user = await auth.getUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      const storagePath = await musicStorage.upload(file, user.id);
      const result = await createMusicTrackAction(title, 'Unknown Artist', storagePath);
      if (!result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      setTitle('');
      setFile(null);
      onUploadComplete?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', padding: 16, display: 'grid', gap: 12 }}>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Track title"
        style={{
          width: '100%',
          padding: '8px 12px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--surface2)',
          color: 'var(--text)',
          fontSize: 14,
          outline: 'none'
        }}
      />
      <input
        type="file"
        accept=".mp3,audio/mpeg"
        onChange={(e) => {
          const f = e.target.files?.[0] || null;
          if (f && !f.name.toLowerCase().endsWith('.mp3')) {
            setError('Only MP3 files are allowed');
            setFile(null);
            return;
          }
          setFile(f);
        }}
        style={{ fontSize: 12, color: 'var(--text3)' }}
      />
      {error && <p style={{ fontSize: 13, color: 'var(--text)' }}>{error}</p>}
      <button
        onClick={handleUpload}
        disabled={uploading || !title.trim() || !file}
        style={{
          width: '100%',
          padding: '10px',
          borderRadius: 8,
          background: '#ffffff',
          border: 'none',
          color: '#ffffff',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'var(--transition)',
          opacity: uploading || !title.trim() || !file ? 0.6 : 1
        }}
      >
        {uploading ? 'Uploading...' : 'Upload Music'}
      </button>
    </div>
  );
}
