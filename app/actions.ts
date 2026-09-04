'use server';

/**
 * Secure server actions for database operations.
 * These run server-side and cannot be bypassed or manipulated by client-side code.
 * All operations are validated against the authenticated user's session.
 */

import { createServerClient } from '@supabase/ssr';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

function revalidateDashboard(paths: string[]) {
  revalidatePath('/dashboard');
  for (const path of paths) {
    revalidatePath(path);
  }
}

/**
 * Get the authenticated user's session server-side.
 * This is more secure than client-only auth checks.
 */
async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
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

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error('Unauthorized: No valid session');
  }

  return user;
}

async function getAuthServerClient() {
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
}

/**
 * Sign in with email and password using a server-backed Supabase client so the
 * dashboard proxy can see the session cookies immediately.
 */
export async function signInAction(email: string, password: string) {
  try {
    const supabase = await getAuthServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) throw error;

    return { success: true, user: data.user, session: data.session };
  } catch (error) {
    return { success: false, error: (error as Error).message, user: null, session: null };
  }
}

/**
 * Sign up with email and password using a server-backed Supabase client.
 * Email confirmation is ON: a fresh signup gets a user but NO session until
 * the inbox link is clicked — callers must handle `needsConfirmation`.
 */
export async function signUpAction(email: string, password: string) {
  try {
    const supabase = await getAuthServerClient();
    const origin = await getPublicOrigin();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    });

    if (error) throw error;

    return { success: true, user: data.user, session: data.session, needsConfirmation: !data.session };
  } catch (error) {
    return { success: false, error: (error as Error).message, user: null, session: null, needsConfirmation: false };
  }
}

/**
 * Sign out and clear the server session cookies.
 */
export async function signOutAction() {
  try {
    const supabase = await getAuthServerClient();
    const { error } = await supabase.auth.signOut();

    if (error) throw error;

    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Resolve the public origin for absolute redirect URLs (password recovery).
 * Prefers the request origin, falls back to the configured site URL.
 */
async function getPublicOrigin() {
  try {
    const { headers } = await import('next/headers');
    const origin = (await headers()).get('origin');
    if (origin) return origin;
  } catch {
    // ignore — fall through to env default
  }
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site) return site.replace(/\/$/, '');
  return 'http://localhost:3000';
}

/**
 * Send a password-recovery email (no session required).
 * The email links to /auth/callback?next=/reset-password which establishes
 * a recovery session, then lands on the reset form.
 */
export async function requestPasswordResetAction(email: string) {
  try {
    const clean = email.trim().toLowerCase();
    if (!clean || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
      return { success: false, error: 'Enter a valid email address' };
    }

    const supabase = await getAuthServerClient();
    const origin = await getPublicOrigin();
    const { error } = await supabase.auth.resetPasswordForEmail(clean, {
      redirectTo: `${origin}/auth/recover`,
    });

    if (error) throw error;

    // Always respond generically so emails can't be enumerated.
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Set a new password for the currently authenticated user.
 * Works for both recovery sessions (after email link) and logged-in users
 * changing their password. Supabase signs out other sessions on change.
 */
export async function updatePasswordAction(newPassword: string) {
  try {
    if (!newPassword || newPassword.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters' };
    }

    await getAuthenticatedUser();
    const supabase = await getAuthServerClient();

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;

    revalidateDashboard(['/dashboard']);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Verify a password against the given email (used to confirm the current
 * password before allowing a change). Uses an isolated in-memory client so
 * the caller's real session cookies are never touched.
 */
export async function verifyPasswordAction(email: string, password: string) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => [], setAll: () => {} } },
    );
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { success: true };
  } catch {
    return { success: false, error: 'Current password is incorrect' };
  }
}

/**
 * Create a note (server-side validation)
 */
export async function createNoteAction(title: string, content: string) {
  try {
    const user = await getAuthenticatedUser();

    const cookieStore = await cookies();
    const supabase = createServerClient(
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

    const { data, error } = await supabase
      .from('notes')
      .insert([
        {
          title,
          content,
          user_id: user.id,
        },
      ])
      .select();

    if (error) throw error;
    revalidateDashboard(['/dashboard/notes']);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Update a note (server-side validation)
 */
export async function updateNoteAction(id: string, title: string, content: string) {
  try {
    const user = await getAuthenticatedUser();

    const cookieStore = await cookies();
    const supabase = createServerClient(
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

    const { data, error } = await supabase
      .from('notes')
      .update({ title, content })
      .eq('id', id)
      .eq('user_id', user.id) // Ensure user owns this note
      .select();

    if (error) throw error;
    revalidateDashboard(['/dashboard/notes']);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Delete a note (server-side validation)
 */
export async function deleteNoteAction(id: string) {
  try {
    const user = await getAuthenticatedUser();

    const cookieStore = await cookies();
    const supabase = createServerClient(
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

    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id); // Ensure user owns this note

    if (error) throw error;
    revalidateDashboard(['/dashboard/notes']);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Create a music track (server-side validation)
 */
export async function createMusicTrackAction(title: string, artist: string, file_url: string) {
  try {
    const user = await getAuthenticatedUser();

    const cookieStore = await cookies();
    const supabase = createServerClient(
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

    const payloads = [
      { title, artist, file_url, user_id: user.id },
      { title, artist, url: file_url, user_id: user.id },
      { title, artist, filePath: file_url, user_id: user.id },
      { title, artist, user_id: user.id },
    ];

    for (const payload of payloads) {
      const { data, error } = await supabase.from('music_tracks').insert([payload]).select();
      if (!error) {
        revalidateDashboard(['/dashboard/music']);
        return { success: true, data };
      }

      const errCode = (error as unknown as { code?: string }).code;
      if (errCode === '42703') {
        continue;
      }

      throw error;
    }

    return { success: false, error: 'Failed to insert music track: no compatible schema found' };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Extract a private-bucket object path from a stored `file_url` (bare path or
 * absolute Supabase URL). Used to clean up storage objects on delete.
 */
function extractBucketPath(stored: unknown, bucket: string): string | null {
  if (typeof stored !== 'string') return null;
  const v = stored.trim();
  if (!v || /^(file:|blob:|data:)/i.test(v)) return null;
  if (!/^https?:\/\//i.test(v)) {
    return v.includes('/') && !/[\s:]/.test(v) ? v : null;
  }
  const m = v.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/(.+?)(?:[?#]|$)/);
  if (!m || m[1] !== bucket) return null;
  try {
    return decodeURIComponent(m[2]);
  } catch {
    return m[2];
  }
}

/**
 * Delete a music track (server-side validation)
 */
export async function deleteMusicTrackAction(id: string) {
  try {
    const user = await getAuthenticatedUser();

    const cookieStore = await cookies();
    const supabase = createServerClient(
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

    const { data: row } = await supabase
      .from('music_tracks')
      .select('file_url')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    const { error } = await supabase
      .from('music_tracks')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;

    // Best-effort: remove the private-bucket object too (never fails the delete)
    const path = extractBucketPath((row as { file_url?: unknown } | null)?.file_url, 'music-files');
    if (path) {
      await supabase.storage.from('music-files').remove([path]);
    }

    revalidateDashboard(['/dashboard/music']);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Create a gallery folder (server-side validation)
 */
export async function createGalleryFolderAction(name: string) {
  try {
    const user = await getAuthenticatedUser();

    const cookieStore = await cookies();
    const supabase = createServerClient(
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

    const { data, error } = await supabase
      .from('gallery_folders')
      .insert([
        {
          name,
          user_id: user.id,
        },
      ])
      .select();

    if (error) throw error;
    revalidateDashboard(['/dashboard/gallery']);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Delete a gallery folder (server-side validation)
 */
export async function deleteGalleryFolderAction(id: string) {
  try {
    const user = await getAuthenticatedUser();

    const cookieStore = await cookies();
    const supabase = createServerClient(
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

    // Collect the folder's image refs first so storage objects can be cleaned up
    const { data: imageRows } = await supabase
      .from('gallery_images')
      .select('id,file_url')
      .eq('folder_id', id)
      .eq('user_id', user.id);

    const { error } = await supabase
      .from('gallery_folders')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;

    // Best-effort cleanup of orphaned rows + private-bucket objects
    const rows = Array.isArray(imageRows) ? imageRows : [];
    if (rows.length > 0) {
      await supabase
        .from('gallery_images')
        .delete()
        .eq('folder_id', id)
        .eq('user_id', user.id);
      const paths = rows
        .map((r) => extractBucketPath((r as { file_url?: unknown }).file_url, 'gallery-images'))
        .filter((p): p is string => !!p);
      if (paths.length > 0) {
        await supabase.storage.from('gallery-images').remove(paths);
      }
    }

    revalidateDashboard(['/dashboard/gallery']);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Create a gallery image (server-side validation)
 */
export async function createGalleryImageAction(
  folder_id: string | null,
  file_url: string,
  _title?: string,
) {
  try {
    if (!folder_id) {
      return { success: false, error: 'Folder is required' };
    }

    const user = await getAuthenticatedUser();

    const cookieStore = await cookies();
    const supabase = createServerClient(
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

    const title = _title?.trim() ? _title.trim().slice(0, 200) : null;
    const payloads = [
      { folder_id, file_url: file_url.trim(), title, user_id: user.id },
      { folder_id, file_url: file_url.trim(), user_id: user.id },
    ];

    for (const payload of payloads) {
      const { data, error } = await supabase.from('gallery_images').insert([payload]).select();
      if (!error) {
        // Revalidate the folder detail route too, not just the list.
        revalidateDashboard(['/dashboard/gallery', `/dashboard/gallery/${folder_id}`]);
        return { success: true, data };
      }

      const errCode = (error as unknown as { code?: string }).code;
      if (errCode === '42703') continue;
      throw error;
    }

    return { success: false, error: 'Failed to insert gallery image: no compatible schema found' };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Delete a gallery image (server-side validation)
 */
export async function deleteGalleryImageAction(id: string) {
  try {
    const user = await getAuthenticatedUser();

    const cookieStore = await cookies();
    const supabase = createServerClient(
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

    const { data: row } = await supabase
      .from('gallery_images')
      .select('file_url,folder_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    const { error } = await supabase
      .from('gallery_images')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;

    // Best-effort: remove the private-bucket object too (never fails the delete)
    const typedRow = row as { file_url?: unknown; folder_id?: unknown } | null;
    const path = extractBucketPath(typedRow?.file_url, 'gallery-images');
    if (path) {
      await supabase.storage.from('gallery-images').remove([path]);
    }

    const folderId = typedRow?.folder_id ? String(typedRow.folder_id) : null;
    revalidateDashboard(
      folderId ? ['/dashboard/gallery', `/dashboard/gallery/${folderId}`] : ['/dashboard/gallery'],
    );
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Create a letter (server-side validation)
 */
export async function createLetterAction(
  recipientName: string,
  content: string,
  recipientEmail?: string,
) {
  try {
    const user = await getAuthenticatedUser();

    const cookieStore = await cookies();
    const supabase = createServerClient(
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

    const payload = {
      recipient_name: recipientName,
      recipient_email: recipientEmail?.trim() ? recipientEmail.trim() : null,
      content,
      user_id: user.id,
    };

    const { data, error } = await supabase.from('letters').insert([payload]).select();
    if (error) throw error;
    revalidateDashboard(['/dashboard/letters']);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Delete a letter (server-side validation)
 */
export async function deleteLetterAction(id: string) {
  try {
    const user = await getAuthenticatedUser();

    const cookieStore = await cookies();
    const supabase = createServerClient(
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

    const { error } = await supabase
      .from('letters')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;
    revalidateDashboard(['/dashboard/letters']);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Update a letter (server-side validation)
 */
export async function updateLetterAction(
  id: string,
  recipientName: string,
  content: string,
  recipientEmail?: string,
) {
  try {
    const user = await getAuthenticatedUser();

    const cookieStore = await cookies();
    const supabase = createServerClient(
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

    const payload = {
      recipient_name: recipientName,
      recipient_email: recipientEmail?.trim() ? recipientEmail.trim() : null,
      content,
    };

    const { error } = await supabase
      .from('letters')
      .update(payload)
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;
    revalidateDashboard(['/dashboard/letters']);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
