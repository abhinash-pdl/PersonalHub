'use server';

/**
 * Server-side data fetching utilities for PersonalHub.
 * All data queries happen server-side only - never exposed to client.
 * Every operation is automatically protected by Supabase RLS policies.
 */

import { cache } from 'react';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { User } from '@supabase/supabase-js';

type Row = Record<string, unknown>;

function getRowString(row: Row, key: string): string | null {
  const v = row[key];
  if (typeof v === 'string') return v;
  if (v === null || v === undefined) return null;
  return String(v);
}

function isSafeHttpUrl(value: string | null): value is string {
  if (!value) return false;
  const v = value.trim();
  if (!v || /^(file:|blob:|data:)/i.test(v)) return false;
  return /^https?:\/\//i.test(v);
}

/** Bare private-bucket object path, e.g. `<userId>/<folderId>/123_photo.jpg`. */
function isStoragePath(value: string | null): value is string {
  if (!value) return false;
  const v = value.trim();
  if (!v || v.length > 512 || !v.includes('/')) return false;
  if (/[\s:]/.test(v)) return false;
  return /^[A-Za-z0-9_][A-Za-z0-9_.\-/]*\.[A-Za-z0-9]{2,5}$/.test(v);
}

function normalizeFileUrl(row: Row): string | null {
  const raw =
    getRowString(row, 'file_url') ||
    getRowString(row, 'image_url') ||
    getRowString(row, 'url') ||
    getRowString(row, 'filePath');
  if (!raw) return null;
  if (isSafeHttpUrl(raw) || isStoragePath(raw)) return raw.trim();
  return null;
}

const GALLERY_BUCKET = 'gallery-images';
const IMAGE_URL_TTL_SECONDS = 60 * 60 * 24; // 24 hours

function currentProjectHost(): string | null {
  try {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!base) return null;
    return new URL(base).host;
  } catch {
    return null;
  }
}

/** Split a stored ref into a signable path, flagging cross-project (dead) URLs. */
function splitGalleryRef(raw: string | null): { path: string | null; stale: boolean } {
  if (!raw) return { path: null, stale: false };
  const v: string = raw;
  // Bare private-bucket path (plain checks here to avoid guard narrowing).
  const looksLikePath =
    v.includes('/') && !/[\s:]/.test(v) && /^[A-Za-z0-9_][A-Za-z0-9_.\-/]*\.[A-Za-z0-9]{2,5}$/.test(v);
  if (looksLikePath) return { path: v, stale: false };
  if (!/^https?:\/\//i.test(v) || /^(file:|blob:|data:)/i.test(v)) {
    return { path: null, stale: false };
  }
  const m = v.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/(.+?)(?:[?#]|$)/);
  if (!m || m[1] !== GALLERY_BUCKET) {
    // Absolute URL that isn't our storage (external or stale project file)
    try {
      const host = new URL(v).host;
      const current = currentProjectHost();
      if (host.endsWith('.supabase.co') && current && host !== current) {
        return { path: null, stale: true };
      }
    } catch {
      // ignore
    }
    return { path: null, stale: false };
  }
  let host = '';
  try {
    host = new URL(v).host;
  } catch {
    return { path: null, stale: false };
  }
  const current = currentProjectHost();
  if (host.endsWith('.supabase.co') && current && host !== current) {
    return { path: null, stale: true };
  }
  try {
    return { path: decodeURIComponent(m[2]), stale: false };
  } catch {
    return { path: m[2], stale: false };
  }
}

type StorageSigner = {
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (
        path: string,
        expiresIn: number,
      ) => Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
    };
  };
};

interface MappedGalleryImage {
  id: string;
  file_url: string | null;
  title: string;
  uploaded_at: string | null;
  folder_id: string | null;
  stale: boolean;
}

function mapGalleryRow(row: Row): MappedGalleryImage {
  return {
    id: String(row.id ?? ''),
    file_url: normalizeFileUrl(row),
    title:
      getRowString(row, 'title') ||
      getRowString(row, 'name') ||
      getRowString(row, 'original_name') ||
      'Untitled',
    uploaded_at: getTimeIso(row),
    folder_id: getRowString(row, 'folder_id'),
    stale: false,
  };
}

/**
 * Resolve every row's stored ref to a signed URL (private bucket).
 * Rows pointing at the dead previous project keep file_url=null + stale=true
 * so the UI shows a re-upload placeholder instead of firing doomed requests.
 */
async function withSignedImageUrls(
  supabase: StorageSigner,
  items: MappedGalleryImage[],
): Promise<MappedGalleryImage[]> {
  await Promise.all(
    items.map(async (item) => {
      if (!item.file_url) return;
      // External (non-Supabase) URLs load directly.
      try {
        const host = new URL(item.file_url).host;
        if (!host.endsWith('.supabase.co')) return;
      } catch {
        // bare path — falls through to signing
      }
      const { path, stale } = splitGalleryRef(item.file_url);
      if (stale) {
        item.file_url = null;
        item.stale = true;
        return;
      }
      if (!path) {
        item.file_url = null;
        return;
      }
      const { data, error } = await supabase.storage
        .from(GALLERY_BUCKET)
        .createSignedUrl(path, IMAGE_URL_TTL_SECONDS);
      if (error || !data?.signedUrl) {
        item.file_url = null;
        return;
      }
      item.file_url = data.signedUrl;
    }),
  );
  return items;
}

function getTimeIso(row: Row): string | null {
  return (
    getRowString(row, 'uploaded_at') ||
    getRowString(row, 'created_at') ||
    getRowString(row, 'inserted_at')
  );
}

const getServerClient = cache(async () => {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    },
  );
});

/**
 * Get authenticated user server-side.
 * Returns null when there is no valid session so read-only pages can render safely.
 * Cached per-request so parallel page fetches share one auth lookup.
 */
export const getAuthenticatedUser = cache(async (): Promise<User | null> => {
  const supabase = await getServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
});

/**
 * Lightweight counts for the dashboard home — avoids loading full row payloads.
 */
export async function fetchDashboardCounts() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return { notes: 0, tracks: 0, photos: 0, letters: 0 };
    }
    const supabase = await getServerClient();

    const [notes, tracks, photos, letters] = await Promise.all([
      supabase
        .from('notes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
      supabase
        .from('music_tracks')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
      supabase
        .from('gallery_images')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
      supabase
        .from('letters')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
    ]);

    return {
      notes: notes.count ?? 0,
      tracks: tracks.count ?? 0,
      photos: photos.count ?? 0,
      letters: letters.count ?? 0,
    };
  } catch (error) {
    console.error('Error fetching dashboard counts:', error);
    return { notes: 0, tracks: 0, photos: 0, letters: 0 };
  }
}

/**
 * Fetch all notes for current user
 * Protected by RLS - only user's own notes returned
 */
export const fetchNotes = cache(async () => {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return [];
    const supabase = await getServerClient();

    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching notes:', error);
    return [];
  }
});

/**
 * Fetch all music tracks for current user
 */
export const fetchMusicTracks = cache(async () => {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return [];
    const supabase = await getServerClient();

    const { data, error } = await supabase
      .from('music_tracks')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map((row: Row) => ({
      id: String(row.id ?? ''),
      title: getRowString(row, 'title') || 'Untitled',
      artist: getRowString(row, 'artist') || 'Unknown Artist',
      file_url: normalizeFileUrl(row),
      uploaded_at: getRowString(row, 'uploaded_at') || getRowString(row, 'created_at') || null,
    }));
  } catch (error) {
    console.error('Error fetching music:', error);
    return [];
  }
});

/**
 * Fetch all gallery folders for current user
 */
export const fetchGalleryFolders = cache(async () => {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return [];
    const supabase = await getServerClient();

    const { data, error } = await supabase
      .from('gallery_folders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching gallery folders:', error);
    return [];
  }
});

/**
 * Fetch all images for a specific folder
 */
export async function fetchGalleryImages(folderId: string) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return [];
    const supabase = await getServerClient();

    const { data, error } = await supabase
      .from('gallery_images')
      .select('*')
      .eq('folder_id', folderId)
      .eq('user_id', user.id)
      .order('uploaded_at', { ascending: false });

    if (error) throw error;
    return withSignedImageUrls(supabase, (data || []).map((row: Row) => mapGalleryRow(row)));
  } catch (error) {
    console.error('Error fetching gallery images:', error);
    return [];
  }
}

/**
 * Fetch all gallery images across all folders
 */
export const fetchAllGalleryImages = cache(async () => {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return [];
    const supabase = await getServerClient();

    const { data, error } = await supabase
      .from('gallery_images')
      .select('*')
      .eq('user_id', user.id)
      .order('uploaded_at', { ascending: false });

    if (error) throw error;
    return withSignedImageUrls(supabase, (data || []).map((row: Row) => mapGalleryRow(row)));
  } catch (error) {
    console.error('Error fetching all gallery images:', error);
    return [];
  }
});

/**
 * Fetch all letters for current user
 */
export const fetchLetters = cache(async () => {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return [];
    const supabase = await getServerClient();

    const { data, error } = await supabase
      .from('letters')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map((row: Row) => ({
      id: String(row.id ?? ''),
      title: getRowString(row, 'recipient_name') || 'Untitled Letter',
      content: getRowString(row, 'content') || '',
      recipient: getRowString(row, 'recipient_name') || '',
      recipient_email: getRowString(row, 'recipient_email') || '',
      created_at:
        getRowString(row, 'created_at') ||
        getRowString(row, 'updated_at') ||
        new Date().toISOString(),
    }));
  } catch (error) {
    console.error('Error fetching letters:', error);
    return [];
  }
});

/**
 * Get current user's email (for UI display)
 */
export const getCurrentUserEmail = cache(async () => {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return null;
    return user.email || 'User';
  } catch {
    // User not authenticated, return null to let middleware handle it
    return null;
  }
});

