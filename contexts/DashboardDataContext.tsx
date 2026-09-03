'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { notes, music, gallery, letters, clearDataCache } from '@/lib/supabase';

type Row = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function iso(v: unknown): string {
  const s = str(v);
  return s || new Date().toISOString();
}

export interface NoteData {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

export interface TrackData {
  id: string;
  title: string;
  artist: string;
  file_url: string;
  uploaded_at: string | null;
}

export interface FolderData {
  id: string;
  name: string;
  created_at: string;
}

export interface ImageData {
  id: string;
  file_url: string | null;
  title: string;
  uploaded_at: string | null;
  folder_id?: string | null;
}

export interface LetterData {
  id: string;
  title: string;
  content: string;
  recipient: string;
  recipient_email?: string;
  created_at: string;
}

export interface DashboardCounts {
  notes: number;
  tracks: number;
  photos: number;
  letters: number;
}

interface DashboardDataContextType {
  loaded: boolean;
  refresh: () => Promise<void>;
  notesData: NoteData[];
  tracks: TrackData[];
  folders: FolderData[];
  images: ImageData[];
  lettersData: LetterData[];
  counts: DashboardCounts;
}

const DashboardDataContext = createContext<DashboardDataContextType | undefined>(undefined);

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [notesData, setNotesData] = useState<NoteData[]>([]);
  const [tracks, setTracks] = useState<TrackData[]>([]);
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [images, setImages] = useState<ImageData[]>([]);
  const [lettersData, setLettersData] = useState<LetterData[]>([]);

  const refresh = useCallback(async () => {
    try {
      clearDataCache();

      // Load data progressively — each query resolves independently
      // so UI updates as soon as each batch arrives
      const loadNotes = async () => {
        try {
          const n = await notes.getAll();
          setNotesData(
            (Array.isArray(n) ? (n as Row[]) : []).map((r) => ({
              id: str(r.id),
              title: str(r.title) || 'Untitled',
              content: str(r.content),
              created_at: iso(r.created_at),
            })),
          );
        } catch (e) {
          console.error('Error loading notes:', e);
        }
      };

      const loadTracks = async () => {
        try {
          const t = await music.getAll();
          setTracks(
            (Array.isArray(t) ? (t as Row[]) : []).map((r) => ({
              id: str(r.id),
              title: str(r.title) || 'Untitled',
              artist: str(r.artist) || 'Unknown Artist',
              file_url: str(r.file_url),
              uploaded_at: iso(r.uploaded_at ?? r.created_at),
            })),
          );
        } catch (e) {
          console.error('Error loading tracks:', e);
        }
      };

      const loadFolders = async () => {
        try {
          const f = await gallery.getFolders();
          setFolders(
            (Array.isArray(f) ? (f as Row[]) : []).map((r) => ({
              id: str(r.id),
              name: str(r.name) || 'Untitled',
              created_at: iso(r.created_at),
            })),
          );
        } catch (e) {
          console.error('Error loading folders:', e);
        }
      };

      const loadImages = async () => {
        try {
          const i = await gallery.getAllImages();
          const allImages = Array.isArray(i) ? (i as Row[]) : [];
          setImages(
            allImages.map((r) => ({
              id: str(r.id),
              file_url: str(r.file_url) || str(r.image_url) || str(r.url) || null,
              title: str(r.title) || str(r.name) || 'Untitled',
              uploaded_at: iso(r.uploaded_at),
              folder_id: str(r.folder_id) || null,
            })),
          );
        } catch (e) {
          console.error('Error loading images:', e);
        }
      };

      const loadLetters = async () => {
        try {
          const l = await letters.getAll();
          setLettersData(
            (Array.isArray(l) ? (l as Row[]) : []).map((r) => ({
              id: str(r.id),
              title: str(r.recipient_name) || str(r.title) || 'Untitled Letter',
              content: str(r.content),
              recipient: str(r.recipient_name) || str(r.title) || '',
              recipient_email: str(r.recipient_email) || '',
              created_at: iso(r.created_at),
            })),
          );
        } catch (e) {
          console.error('Error loading letters:', e);
        }
      };

      // Fire all queries in parallel but don't block on the slowest one
      await Promise.allSettled([loadNotes(), loadTracks(), loadFolders(), loadImages(), loadLetters()]);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const counts: DashboardCounts = useMemo(
    () => ({
      notes: notesData.length,
      tracks: tracks.length,
      photos: images.length,
      letters: lettersData.length,
    }),
    [notesData.length, tracks.length, images.length, lettersData.length],
  );

  const value = useMemo<DashboardDataContextType>(
    () => ({ loaded, refresh, notesData, tracks, folders, images, lettersData, counts }),
    [loaded, refresh, notesData, tracks, folders, images, lettersData, counts],
  );

  return <DashboardDataContext.Provider value={value}>{children}</DashboardDataContext.Provider>;
}

export function useDashboardData() {
  const ctx = useContext(DashboardDataContext);
  if (!ctx) throw new Error('useDashboardData must be used within DashboardDataProvider');
  return ctx;
}
