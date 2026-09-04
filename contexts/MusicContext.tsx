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
import { classifyFileUrl, dropCachedMediaUrl, isLoadableFileUrl, music, resolveMusicUrl } from '@/lib/supabase';

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  file_url: string;
  duration: number;
  created_at: string;
}

function normalizeTrack(row: Record<string, unknown>): MusicTrack | null {
  const raw =
    (row.file_url as string | null | undefined) ??
    (row.url as string | null | undefined) ??
    (row.filePath as string | null | undefined) ??
    '';
  // Keep rows with any usable reference: private-bucket paths, current-host
  // URLs, or external URLs. Stale-host rows are partitioned out later; drop
  // file:// / empty values so the player never attempts a blocked fetch.
  if (classifyFileUrl(raw) === 'invalid') return null;
  const fileUrl = raw;
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
  /** Rows whose file_url points at a previous (dead) Supabase project — need re-upload. */
  staleTracks: MusicTrack[];
  loading: boolean;
  error: string;
  audioError: string;
  refreshTracks: () => Promise<void>;
  upsertTrack: (track: MusicTrack) => void;
  removeTrack: (id: string) => void;
  removeStaleTracks: () => void;
}

const MusicLibraryContext = createContext<MusicLibraryContextType | undefined>(undefined);

export type RepeatMode = 'all' | 'one' | 'off';

// --- Player context (current track, playback controls) — updates frequently ---
interface MusicPlayerContextType {
  currentTrack: MusicTrack | null;
  isPlaying: boolean;
  duration: number;
  repeatMode: RepeatMode;
  playTrack: (track: MusicTrack) => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  next: () => void;
  prev: () => void;
  stop: () => void;
  cycleRepeat: () => void;
  subscribeProgress: (listener: ProgressListener) => () => void;
}

const MusicPlayerContext = createContext<MusicPlayerContextType | undefined>(undefined);

const STORAGE_TRACK_ID = 'ph:music:last-track-id';
const STORAGE_CACHED_TRACKS = 'ph:music:cached-tracks';
const STORAGE_SESSION_RANDOM = 'ph:music:session-random';

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

function readCachedTracks(): MusicTrack[] | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_CACHED_TRACKS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const valid = (parsed as MusicTrack[]).filter((t) => isLoadableFileUrl(t?.file_url));
    if (valid.length === 0) return null;
    return valid;
  } catch {
    return null;
  }
}

function writeCachedTracks(tracks: MusicTrack[]) {
  try {
    window.localStorage.setItem(STORAGE_CACHED_TRACKS, JSON.stringify(tracks));
  } catch {
    // ignore
  }
}

function getSessionRandomIndex(): number | null {
  try {
    const val = window.localStorage.getItem(STORAGE_SESSION_RANDOM);
    return val !== null ? parseInt(val, 10) : null;
  } catch {
    return null;
  }
}

function writeSessionRandomIndex(index: number) {
  try {
    window.localStorage.setItem(STORAGE_SESSION_RANDOM, String(index));
  } catch {
    // ignore
  }
}

function pickRandomTrack(tracks: MusicTrack[]): MusicTrack {
  const idx = Math.floor(Math.random() * tracks.length);
  return tracks[idx];
}

export function MusicProvider({ children }: { children: ReactNode }) {
  // --- Library state (rarely changes) ---
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [staleTracks, setStaleTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [audioError, setAudioError] = useState('');

  // --- Player state ---
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  // Circular playlist loops infinitely by default (repeat all).
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('all');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tracksRef = useRef<MusicTrack[]>([]);
  const currentTrackRef = useRef<MusicTrack | null>(null);
  const repeatModeRef = useRef<RepeatMode>('all');
  const retryRef = useRef(new Map<string, number>());
  const progressListenersRef = useRef(new Set<ProgressListener>());
  const durationRef = useRef(0);
  const lastProgressEmitRef = useRef(0);
  const hasInitialized = useRef(false);
  const hasAutoPlayed = useRef(false);

  // Keep refs in sync via effect to avoid ref-during-render lint errors
  useEffect(() => {
    tracksRef.current = tracks;
    currentTrackRef.current = currentTrack;
    repeatModeRef.current = repeatMode;
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
      const normalized = rows
        .map((row) => normalizeTrack(row as Record<string, unknown>))
        .filter((t): t is MusicTrack => t !== null);
      // Partition: only current-project/external URLs are loadable. Rows pointing
      // at a previous Supabase project would only produce CORS/network errors.
      const loadable = normalized.filter((t) => isLoadableFileUrl(t.file_url));
      const stale = normalized.filter((t) => classifyFileUrl(t.file_url) === 'stale');
      setTracks(loadable);
      setStaleTracks(stale);
      writeCachedTracks(loadable);
      if (rows.length > 0 && normalized.length === 0) {
        setError('Tracks found but their file URLs are invalid. Re-upload the MP3s.');
      }
    } catch (err: unknown) {
      console.error('Error loading tracks:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tracks');
    } finally {
      setLoading(false);
    }
  }, []);

  const upsertTrack = useCallback((track: MusicTrack) => {
    if (!isLoadableFileUrl(track.file_url)) return;
    setTracks((prev) => {
      const next = [track, ...prev.filter((t) => t.id !== track.id)];
      writeCachedTracks(next);
      return next;
    });
  }, []);

  const removeTrack = useCallback((id: string) => {
    setTracks((prev) => {
      const next = prev.filter((t) => t.id !== id);
      writeCachedTracks(next);
      return next;
    });
  }, []);

  const removeStaleTracks = useCallback(() => {
    setStaleTracks([]);
  }, []);

  // --- Player actions ---
  // Buckets are private: resolve a fresh signed URL for every play (cheap,
  // cached for 7 days) so playback never relies on an expired link.
  const playTokenRef = useRef(0);
  const playTrack = useCallback((track: MusicTrack) => {
    const state = classifyFileUrl(track.file_url);
    if (state === 'stale') {
      setAudioError(`"${track.title || 'Track'}" points at old storage from a previous project. Re-upload it.`);
      return;
    }
    if (state === 'invalid') {
      setAudioError(`"${track.title || 'Track'}" has an invalid file URL and can't be played.`);
      return;
    }
    setAudioError('');
    setCurrentTrack(track);
    writeSavedTrackId(track.id);
    emitProgress(0, durationRef.current, true);
    const token = ++playTokenRef.current;
    retryRef.current.delete(track.id);
    const el = audioRef.current;
    if (!el) {
      setIsPlaying(true);
      return;
    }
    setIsPlaying(true);
    void (async () => {
      const src = await resolveMusicUrl(track.file_url);
      if (token !== playTokenRef.current) return; // superseded by a newer play
      if (!src) {
        setAudioError(`"${track.title || 'Track'}" couldn't load. Re-upload it and try again.`);
        setIsPlaying(false);
        return;
      }
      el.src = src;
      // No crossOrigin: plain playback doesn't need CORS preflights.
      el.play().catch(() => {
        // Autoplay blocked — track stays selected, user presses play.
        if (token === playTokenRef.current) setIsPlaying(false);
      });
    })();
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

  // Circular playlist: next/prev wrap around so the queue loops infinitely.
  const next = useCallback(() => {
    const tl = tracksRef.current;
    if (tl.length === 0) return;
    const ct = currentTrackRef.current;
    const idx = ct ? tl.findIndex((t) => t.id === ct.id) : -1;
    playTrack(tl[(idx + 1 + tl.length) % tl.length]);
  }, [playTrack]);

  const prev = useCallback(() => {
    const tl = tracksRef.current;
    if (tl.length === 0) return;
    const ct = currentTrackRef.current;
    const idx = ct ? tl.findIndex((t) => t.id === ct.id) : -1;
    playTrack(tl[(idx - 1 + tl.length) % tl.length]);
  }, [playTrack]);

  const cycleRepeat = useCallback(() => {
    setRepeatMode((mode) => (mode === 'all' ? 'one' : mode === 'one' ? 'off' : 'all'));
  }, []);

  const stop = useCallback(() => {
    playTokenRef.current++; // cancel any in-flight signed-URL resolve
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
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
      const mode = repeatModeRef.current;
      if (mode === 'off') {
        setIsPlaying(false);
        return;
      }
      if (mode === 'one') {
        const el2 = audioRef.current;
        if (el2) {
          el2.currentTime = 0;
          el2.play().catch(() => setIsPlaying(false));
        }
        return;
      }
      // 'all': advance circularly (wraps from last back to first infinitely)
      const tl = tracksRef.current;
      const ct = currentTrackRef.current;
      if (!ct || tl.length === 0) {
        setIsPlaying(false);
        return;
      }
      const idx = tl.findIndex((t) => t.id === ct.id);
      playTrack(tl[(idx + 1 + tl.length) % tl.length]);
    };

    const onError = () => {
      const ct = currentTrackRef.current;
      // One self-heal attempt: the signed URL may have expired mid-session —
      // drop the cached link, mint a fresh one, and retry before giving up.
      const key = ct ? ct.id : '';
      const attempts = (retryRef.current.get(key) || 0) + 1;
      retryRef.current.set(key, attempts);
      if (ct && attempts <= 1) {
        const el2 = audioRef.current;
        dropCachedMediaUrl('music', ct.file_url);
        void resolveMusicUrl(ct.file_url).then((src) => {
          if (!src || currentTrackRef.current?.id !== ct.id) {
            setAudioError(`"${ct.title || 'Track'}" couldn't load. Check your connection and storage access, or re-upload it.`);
            setIsPlaying(false);
            return;
          }
          if (el2) {
            el2.src = src;
            el2.play().catch(() => setIsPlaying(false));
          }
        });
        return;
      }
      setAudioError(
        ct
          ? `"${ct.title || 'Track'}" couldn't load. Check your connection and storage access, or re-upload it.`
          : 'Audio failed to load.',
      );
      setIsPlaying(false);
    };
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    el.addEventListener('error', onError);

    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('error', onError);
    };
  }, [emitProgress, playTrack]);

  // --- Load tracks on mount: use cached tracks first for instant display, then refresh ---
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    // Show cached tracks instantly (no loading spinner)
    const cached = readCachedTracks();
    if (cached && cached.length > 0) {
      queueMicrotask(() => {
        setTracks(cached);
        setLoading(false);
      });
    }

    // Always refresh from server in the background
    refreshTracks();
  }, [refreshTracks]);

  // --- Restore last-played track and auto-play ---
  useEffect(() => {
    if (loading || tracks.length === 0 || hasAutoPlayed.current) return;

    const savedId = readSavedTrackId();
    let trackToPlay: MusicTrack | null = null;

    if (savedId) {
      // Restore last played track
      trackToPlay = tracks.find((t) => t.id === savedId) ?? null;
    }

    if (!trackToPlay) {
      // No saved track or track was deleted — pick random for this session
      const randomIdx = getSessionRandomIndex();
      if (randomIdx !== null && randomIdx < tracks.length) {
        trackToPlay = tracks[randomIdx];
      } else {
        trackToPlay = pickRandomTrack(tracks);
        writeSessionRandomIndex(tracks.indexOf(trackToPlay));
      }
    }

    if (trackToPlay) {
      hasAutoPlayed.current = true;
      if (!isLoadableFileUrl(trackToPlay.file_url)) return;
      // Resolve through the same signed-URL path as manual playback
      playTrack(trackToPlay);
    }
  }, [loading, tracks, playTrack]);

  // --- Sync CSS variable for layout (match responsive bar heights) ---
  useEffect(() => {
    if (!currentTrack) {
      document.documentElement.style.setProperty('--music-bar-height', '0px');
      return;
    }
    const mqSmall = window.matchMedia('(max-width: 560px)');
    const mqMedium = window.matchMedia('(max-width: 860px)');
    const apply = () => {
      const h = mqSmall.matches ? '44px' : mqMedium.matches ? '48px' : '56px';
      document.documentElement.style.setProperty('--music-bar-height', h);
    };
    apply();
    mqSmall.addEventListener('change', apply);
    mqMedium.addEventListener('change', apply);
    return () => {
      mqSmall.removeEventListener('change', apply);
      mqMedium.removeEventListener('change', apply);
      document.documentElement.style.setProperty('--music-bar-height', '0px');
    };
  }, [currentTrack]);

  const libraryValue = useMemo<MusicLibraryContextType>(
    () => ({ tracks, staleTracks, loading, error: error || audioError, audioError, refreshTracks, upsertTrack, removeTrack, removeStaleTracks }),
    [tracks, staleTracks, loading, error, audioError, refreshTracks, upsertTrack, removeTrack, removeStaleTracks],
  );

  const playerValue = useMemo<MusicPlayerContextType>(
    () => ({ currentTrack, isPlaying, duration, repeatMode, playTrack, togglePlay, seek, next, prev, stop, cycleRepeat, subscribeProgress }),
    [currentTrack, isPlaying, duration, repeatMode, playTrack, togglePlay, seek, next, prev, stop, cycleRepeat, subscribeProgress],
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
