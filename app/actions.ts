'use server';

import { createServerClient } from '@supabase/ssr';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

function revalidateDashboard(paths: string[]) {
  revalidatePath('/dashboard');
  for (const path of paths) {
    revalidatePath(path);
  }
}

// Server mutations verify the token with the Auth server.
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

async function getPublicOrigin() {
  try {
    const { headers } = await import('next/headers');
    const origin = (await headers()).get('origin');
    if (origin) return origin;
  } catch {

  }
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site) return site.replace(/\/$/, '');
  return 'http://localhost:3000';
}

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

    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

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
      .eq('user_id', user.id)
      .select();

    if (error) throw error;
    revalidateDashboard(['/dashboard/notes']);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

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
      .eq('user_id', user.id);

    if (error) throw error;
    revalidateDashboard(['/dashboard/notes']);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

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
