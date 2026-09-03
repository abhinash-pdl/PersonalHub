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

function normalizeFileUrl(row: Row): string | null {
  return (
    getRowString(row, 'file_url') ||
    getRowString(row, 'image_url') ||
    getRowString(row, 'url') ||
    getRowString(row, 'filePath')
  );
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
    return (data || []).map((row: Row) => ({
      id: String(row.id ?? ''),
      file_url: normalizeFileUrl(row),
      title:
        getRowString(row, 'title') ||
        getRowString(row, 'name') ||
        getRowString(row, 'original_name') ||
        'Untitled',
      uploaded_at: getTimeIso(row),
      folder_id: getRowString(row, 'folder_id'),
    }));
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
    return (data || []).map((row: Row) => ({
      id: String(row.id ?? ''),
      file_url: normalizeFileUrl(row),
      title:
        getRowString(row, 'title') ||
        getRowString(row, 'name') ||
        getRowString(row, 'original_name') ||
        'Untitled',
      uploaded_at: getTimeIso(row),
      folder_id: getRowString(row, 'folder_id'),
    }));
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

