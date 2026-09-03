'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

type ProgressListener = (currentTime: number, duration: number) => void;

// --- Library context (tracks, loading) — updates rarely ---
interface MusicLibraryContextType {
  tracks: MusicTrack[];
  loading: boolean;
  error: string;
  refreshTracks: () => Promise<void>;
  upsertTrack: (track: MusicTrack) => void;
}

const MusicLibraryContext = createContext<MusicLibraryContextType | undefined>(undefined);

// --- Player context (current track, playback controls) — updates frequently ---
interface MusicPlayerContextType {
  currentTrack: MusicTrack | null;
  isPlaying: boolean;
  duration: number;
  playTrack: (track: MusicTrack) => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  next: () => void;
  prev: () => void;
  stop: () => void;
  subscribeProgress: (listener: ProgressListener) => () => void;
}

const MusicPlayerContext = createContext<MusicPlayerContextType | undefined>(undefined);

const STORAGE_TRACK_ID = 'ph:music:last-track-id';

function readSavedTrackId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_TRACK_ID);
  } catch {
    return null;
  }
}

function writeSavedTrackId(id: string) {
  try {
    window.localStorage.setItem(STORAGE_TRACK_ID, id);
  } catch {
    // ignore
  }
}

export function MusicProvider({ children }: { children: ReactNode }) {
  // --- Library state (rarely changes) ---
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // --- Player state ---
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tracksRef = useRef<MusicTrack[]>([]);
  const currentTrackRef = useRef<MusicTrack | null>(null);
  const progressListenersRef = useRef(new Set<ProgressListener>());
  const durationRef = useRef(0);
  const lastProgressEmitRef = useRef(0);
  const hasInitialized = useRef(false);

  // Keep refs in sync via effect to avoid ref-during-render lint errors
  useEffect(() => {
    tracksRef.current = tracks;
    currentTrackRef.current = currentTrack;
  });

  const emitProgress = useCallback((time: number, total: number, force = false) => {
    const now = performance.now();
    if (!force && now - lastProgressEmitRef.current < 200) return;
    lastProgressEmitRef.current = now;
    progressListenersRef.current.forEach((listener) => listener(time, total));
  }, []);

  const subscribeProgress = useCallback((listener: ProgressListener) => {
    progressListenersRef.current.add(listener);
    return () => {
      progressListenersRef.current.delete(listener);
    };
  }, []);

  // --- Library actions ---
  const refreshTracks = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await music.getAll();
      const rows = Array.isArray(data) ? (data as unknown[]) : [];
      setTracks(rows.map((row) => normalizeTrack(row as Record<string, unknown>)));
    } catch (err: unknown) {
      console.error('Error loading tracks:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tracks');
    } finally {
      setLoading(false);
    }
  }, []);

  const upsertTrack = useCallback((track: MusicTrack) => {
    setTracks((prev) => [track, ...prev.filter((t) => t.id !== track.id)]);
  }, []);

  // --- Player actions ---
  const playTrack = useCallback((track: MusicTrack) => {
    setCurrentTrack(track);
    writeSavedTrackId(track.id);
    emitProgress(0, durationRef.current, true);
    const el = audioRef.current;
    if (el) {
      el.src = track.file_url;
      el.play().catch(() => {});
    }
    setIsPlaying(true);
  }, [emitProgress]);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el || !currentTrackRef.current) return;
    if (el.paused) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, []);

  const seek = useCallback((time: number) => {
    const el = audioRef.current;
    if (el) {
      el.currentTime = time;
      emitProgress(time, el.duration || durationRef.current, true);
    }
  }, [emitProgress]);

  const next = useCallback(() => {
    const ct = currentTrackRef.current;
    const tl = tracksRef.current;
    if (!ct || tl.length === 0) return;
    const idx = tl.findIndex((t) => t.id === ct.id);
    if (idx >= 0 && idx < tl.length - 1) {
      playTrack(tl[idx + 1]);
    }
  }, [playTrack]);

  const prev = useCallback(() => {
    const ct = currentTrackRef.current;
    const tl = tracksRef.current;
    if (!ct || tl.length === 0) return;
    const idx = tl.findIndex((t) => t.id === ct.id);
    if (idx > 0) {
      playTrack(tl[idx - 1]);
    }
  }, [playTrack]);

  const stop = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.src = '';
    }
    setCurrentTrack(null);
    setIsPlaying(false);
    setDuration(0);
    durationRef.current = 0;
    emitProgress(0, 0, true);
  }, [emitProgress]);

  // --- Audio element event listeners (set up once) ---
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onTime = () => {
      const total = el.duration || durationRef.current;
      emitProgress(el.currentTime, total);
    };
    const onMeta = () => {
      const total = el.duration || 0;
      durationRef.current = total;
      setDuration(total);
      emitProgress(el.currentTime, total, true);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      const tl = tracksRef.current;
      const ct = currentTrackRef.current;
      if (!ct || tl.length === 0) return;
      const idx = tl.findIndex((t) => t.id === ct.id);
      if (idx >= 0 && idx < tl.length - 1) {
        playTrack(tl[idx + 1]);
      } else {
        setIsPlaying(false);
      }
    };

    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);

    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
    };
  }, [emitProgress, playTrack]);

  // --- Load tracks on mount (no auto-play) ---
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    refreshTracks();
  }, [refreshTracks]);

  // --- Restore last-played track (metadata only, no auto-play) ---
  useEffect(() => {
    if (loading || tracks.length === 0 || currentTrack) return;
    const savedId = readSavedTrackId();
    if (!savedId) return;
    const restored = tracks.find((t) => t.id === savedId);
    if (restored) {
      // use queueMicrotask to avoid setState in effect lint issue
      queueMicrotask(() => setCurrentTrack(restored));
    }
  }, [loading, tracks, currentTrack]);

  // --- Sync CSS variable for layout ---
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--music-bar-height',
      currentTrack ? '56px' : '0px',
    );
    return () => {
      document.documentElement.style.setProperty('--music-bar-height', '0px');
    };
  }, [currentTrack]);

  const libraryValue = useMemo<MusicLibraryContextType>(
    () => ({ tracks, loading, error, refreshTracks, upsertTrack }),
    [tracks, loading, error, refreshTracks, upsertTrack],
  );

  const playerValue = useMemo<MusicPlayerContextType>(
    () => ({ currentTrack, isPlaying, duration, playTrack, togglePlay, seek, next, prev, stop, subscribeProgress }),
    [currentTrack, isPlaying, duration, playTrack, togglePlay, seek, next, prev, stop, subscribeProgress],
  );

  return (
    <MusicLibraryContext.Provider value={libraryValue}>
      <MusicPlayerContext.Provider value={playerValue}>
        {children}
        <audio ref={audioRef} preload="metadata" style={{ display: 'none' }} />
      </MusicPlayerContext.Provider>
    </MusicLibraryContext.Provider>
  );
}

/**
 * useMusicLibrary — for components that only need the track list.
 * Does NOT re-render on playback progress or current track changes.
 */
export function useMusicLibrary() {
  const ctx = useContext(MusicLibraryContext);
  if (ctx === undefined) throw new Error('useMusicLibrary must be used within a MusicProvider');
  return ctx;
}

/**
 * useMusicPlayer — for components that only need playback controls (e.g. MusicBar).
 * Does NOT re-render when the track list changes.
 */
export function useMusicPlayer() {
  const ctx = useContext(MusicPlayerContext);
  if (ctx === undefined) throw new Error('useMusicPlayer must be used within a MusicProvider');
  return ctx;
}

/**
 * useMusic — for components that need both library + player state.
 */
export function useMusic() {
  const lib = useContext(MusicLibraryContext);
  const player = useContext(MusicPlayerContext);
  if (lib === undefined || player === undefined) {
    throw new Error('useMusic must be used within a MusicProvider');
  }
  return { ...lib, ...player };
}
