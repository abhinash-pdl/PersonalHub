'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { music } from '@/lib/supabase';

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  file_url: string;
  duration: number;
  created_at: string;
}

function normalizeTrack(row: Record<string, unknown>): MusicTrack {
  const fileUrl =
    (row.file_url as string) ??
    (row.url as string) ??
    (row.filePath as string) ??
    '';
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    artist: String(row.artist ?? 'Unknown Artist'),
    file_url: fileUrl,
    duration: typeof row.duration === 'number' ? row.duration : Number(row.duration) || 0,
    created_at: String(row.created_at ?? ''),
  };
}

interface MusicContextType {
  tracks: MusicTrack[];
  currentTrack: MusicTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  loading: boolean;
  error: string;
  playTrack: (track: MusicTrack) => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  next: () => void;
  prev: () => void;
  refreshTracks: () => Promise<void>;
  upsertTrack: (track: MusicTrack) => void;
  stop: () => void;
}

const MusicContext = createContext<MusicContextType | undefined>(undefined);

export function MusicProvider({ children }: { children: ReactNode }) {
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasBootstrappedAutoplay = useRef(false);
  const [waitingForGesture, setWaitingForGesture] = useState(false);
  const STORAGE_TRACK_ID = 'ph:music:last-track-id';

  const refreshTracks = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await music.getAll();
      const rows = Array.isArray(data) ? (data as unknown[]) : [];
      const list = rows.map((row) => normalizeTrack(row as Record<string, unknown>));
      setTracks(list);
    } catch (err: unknown) {
      console.error('Error loading tracks:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tracks');
    } finally {
      setLoading(false);
    }
  }, []);

  const upsertTrack = useCallback((track: MusicTrack) => {
    setTracks((currentTracks) => [
      track,
      ...currentTracks.filter((existingTrack) => existingTrack.id !== track.id),
    ]);
  }, []);

  useEffect(() => {
    refreshTracks();
  }, [refreshTracks]);

  useEffect(() => {
    if (!currentTrack) return;
    if (tracks.length === 0) return;
    if (!tracks.some((t) => t.id === currentTrack.id)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentTrack(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      const el = audioRef.current;
      if (el) {
        el.pause();
        el.src = '';
      }
    }
  }, [tracks, currentTrack]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onTime = () => setCurrentTime(el.currentTime);
    const onMeta = () => setDuration(el.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);

    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
    };
  }, []);

  const playTrack = useCallback((track: MusicTrack) => {
    setCurrentTrack(track);
    setCurrentTime(0);
    const el = audioRef.current;
    if (el) {
      el.src = track.file_url;
      el.play().catch(() => {
        setWaitingForGesture(true);
      });
    }
    setIsPlaying(true);
    try {
      window.localStorage.setItem(STORAGE_TRACK_ID, track.id);
    } catch {
      // ignore storage errors
    }
  }, []);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el || !currentTrack) return;
    if (el.paused) {
      el.play().catch((e) => console.error('Playback error:', e));
    } else {
      el.pause();
    }
  }, [currentTrack]);

  const seek = useCallback((time: number) => {
    const el = audioRef.current;
    if (el) {
      el.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const next = useCallback(() => {
    if (!currentTrack || tracks.length === 0) return;
    const idx = tracks.findIndex((t) => t.id === currentTrack.id);
    if (idx >= 0 && idx < tracks.length - 1) {
      playTrack(tracks[idx + 1]);
    }
  }, [currentTrack, tracks, playTrack]);

  const prev = useCallback(() => {
    if (!currentTrack || tracks.length === 0) return;
    const idx = tracks.findIndex((t) => t.id === currentTrack.id);
    if (idx > 0) {
      playTrack(tracks[idx - 1]);
    }
  }, [currentTrack, tracks, playTrack]);

  const stop = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.src = '';
    }
    setCurrentTrack(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const handleEnded = useCallback(() => {
    if (!currentTrack || tracks.length === 0) return;
    const idx = tracks.findIndex((t) => t.id === currentTrack.id);
    if (idx >= 0 && idx < tracks.length - 1) {
      playTrack(tracks[idx + 1]);
    } else {
      setIsPlaying(false);
    }
  }, [currentTrack, tracks, playTrack]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.addEventListener('ended', handleEnded);
    return () => el.removeEventListener('ended', handleEnded);
  }, [handleEnded]);

  useEffect(() => {
    if (hasBootstrappedAutoplay.current) return;
    if (loading) return;
    if (tracks.length === 0) return;
    if (currentTrack) return;

    hasBootstrappedAutoplay.current = true;
    let target = tracks[0];

    try {
      const savedTrackId = window.localStorage.getItem(STORAGE_TRACK_ID);
      if (savedTrackId) {
        const restored = tracks.find((track) => track.id === savedTrackId);
        if (restored) target = restored;
      }
    } catch {
      // ignore storage errors
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    playTrack(target);
  }, [tracks, loading, currentTrack, playTrack]);

  useEffect(() => {
    if (!waitingForGesture) return;
    const el = audioRef.current;
    if (!el) return;
    if (!currentTrack) return;

    const resumePlayback = () => {
      el.play()
        .then(() => {
          setWaitingForGesture(false);
          setIsPlaying(true);
        })
        .catch(() => {
          // still blocked by browser policy
        });
    };

    const opts = { once: true } as const;
    window.addEventListener('pointerdown', resumePlayback, opts);
    window.addEventListener('keydown', resumePlayback, opts);

    return () => {
      window.removeEventListener('pointerdown', resumePlayback);
      window.removeEventListener('keydown', resumePlayback);
    };
  }, [waitingForGesture, currentTrack]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--music-player-height',
      currentTrack ? '4.5rem' : '0px',
    );
    return () => {
      document.documentElement.style.removeProperty('--music-player-height');
    };
  }, [currentTrack]);

  const value: MusicContextType = {
    tracks,
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    loading,
    error,
    playTrack,
    togglePlay,
    seek,
    next,
    prev,
    refreshTracks,
    upsertTrack,
    stop,
  };

  return (
    <MusicContext.Provider value={value}>
      {children}
      <audio ref={audioRef} className="hidden" preload="metadata" />
    </MusicContext.Provider>
  );
}

export function useMusic() {
  const ctx = useContext(MusicContext);
  if (ctx === undefined) {
    throw new Error('useMusic must be used within a MusicProvider');
  }
  return ctx;
}
