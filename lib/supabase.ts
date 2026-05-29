import { AuthError, User, SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

const BUCKET_MUSIC = 'music-files';
const BUCKET_GALLERY = 'gallery-images';

let supabaseClient: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient => {
  if (!supabaseClient) {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }

    supabaseClient = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return supabaseClient;
};

// Helper: perform a select with robust ordering fallback.
// Tries each candidate column in order; if none exist, returns results without ordering.
async function selectWithOrder(
  table: string,
  selectCols = '*',
  filters: Array<[string, unknown]> = [],
  orderCandidates: string[] = ['created_at', 'uploaded_at', 'uploaded_at_timestamp', 'id'],
) {
  const client = getSupabaseClient();

  for (const col of orderCandidates) {
    let builder = client.from(table).select(selectCols);
    for (const [k, v] of filters) builder = builder.eq(k, v);
    try {
      // attempt ordering by candidate column
      // Supabase returns { data, error }
      const res = await builder.order(col, { ascending: false });
      if (res.error) {
        // if column doesn't exist, Postgres returns code 42703
        const errCode = (res.error as unknown as { code?: string }).code;
        if (errCode === '42703') {
          continue; // try next candidate
        }
        throw res.error;
      }
      return res.data || [];
    } catch (err: unknown) {
      // If error mentions missing column, try next candidate; otherwise rethrow
      const msg = String((err as { message?: unknown } | null | undefined)?.message || err);
      if (msg.includes('column') && msg.includes('does not exist')) {
        continue;
      }
      throw err;
    }
  }

  // final attempt without ordering
  let finalBuilder = client.from(table).select(selectCols);
  for (const [k, v] of filters) finalBuilder = finalBuilder.eq(k, v);
  const finalRes = await finalBuilder;
  if (finalRes.error) throw finalRes.error;
  return finalRes.data || [];
}

function safeStorageSegment(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function buildMusicStorageKey(userId: string, fileName: string) {
  const extensionMatch = fileName.match(/\.[^./\\]+$/);
  const extension = extensionMatch ? extensionMatch[0].toLowerCase() : '';
  const baseName = extensionMatch ? fileName.slice(0, -extension.length) : fileName;
  const safeBaseName = safeStorageSegment(baseName) || 'track';
  const uniquePart = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return `${safeStorageSegment(userId)}/${Date.now()}_${uniquePart}_${safeBaseName}${extension}`;
}

/**
 * Authentication Functions
 */
export const auth = {
  async signup(email: string, password: string): Promise<{ user: User | null; error: AuthError | null }> {
    const { data, error } = await getSupabaseClient().auth.signUp({ email, password });
    return { user: data.user, error };
  },

  async login(email: string, password: string): Promise<{ user: User | null; error: AuthError | null }> {
    const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
    return { user: data.user, error };
  },

  async logout(): Promise<{ error: AuthError | null }> {
    const { error } = await getSupabaseClient().auth.signOut();
    return { error };
  },

  async getUser(): Promise<User | null> {
    const { data } = await getSupabaseClient().auth.getUser();
    return data.user || null;
  },

  async getSession() {
    const { data } = await getSupabaseClient().auth.getSession();
    return data.session;
  },

  onAuthStateChange(callback: (user: User | null) => void) {
    return getSupabaseClient().auth.onAuthStateChange((_event, session) => {
      callback(session?.user || null);
    });
  },
};

/**
 * Database Functions for Notes
 */
export const notes = {
  async getAll() {
    const { data: { user } } = await getSupabaseClient().auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const data = await selectWithOrder('notes', '*', [['user_id', user.id]]);
    return data || [];
  },

  async create(title: string, content: string) {
    const { data: { user } } = await getSupabaseClient().auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await getSupabaseClient()
      .from('notes')
      .insert([{ title, content, user_id: user.id }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, title: string, content: string) {
    const { data: { user } } = await getSupabaseClient().auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await getSupabaseClient()
      .from('notes')
      .update({ title, content, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string) {
    const { data: { user } } = await getSupabaseClient().auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await getSupabaseClient()
      .from('notes')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw error;
  },

  subscribe(callback: (change: unknown) => void) {
    return getSupabaseClient()
      .channel('notes_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notes',
        },
        (payload) => callback(payload),
      )
      .subscribe();
  },
};

/**
 * Database Functions for Music
 */
export const music = {
  async getAll() {
    const { data: { user } } = await getSupabaseClient().auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const data = await selectWithOrder('music_tracks', '*', [['user_id', user.id]]);
    return data || [];
  },

  async create(title: string, artist: string, fileUrl: string) {
    const { data: { user } } = await getSupabaseClient().auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Try inserting with the expected `file_url` column, but gracefully
    // handle schema variations by retrying with alternative column names.
    const client = getSupabaseClient();
    const inserts = [
      { title, artist, file_url: fileUrl, user_id: user.id },
      { title, artist, url: fileUrl, user_id: user.id },
      { title, artist, filePath: fileUrl, user_id: user.id },
      { title, artist, user_id: user.id },
    ];

    for (const payload of inserts) {
      const { data, error } = await client.from('music_tracks').insert([payload]).select().single();
      if (!error) return data;
      // if missing column, try next payload; rethrow on other errors
      const errCode = (error as unknown as { code?: string }).code;
      if (errCode && String(errCode) === '42703') {
        continue;
      }
      throw error;
    }
    throw new Error('Failed to insert music track: no compatible schema found');
  },

  async delete(id: string) {
    const { data: { user } } = await getSupabaseClient().auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await getSupabaseClient()
      .from('music_tracks')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw error;
  },

  subscribe(callback: (change: unknown) => void) {
    return getSupabaseClient()
      .channel('music_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'music_tracks',
        },
        (payload) => callback(payload),
      )
      .subscribe();
  },
};

/**
 * Storage Functions for Music Files
 */
export const musicStorage = {
  async upload(file: File, userId: string): Promise<string> {
    const fileName = buildMusicStorageKey(userId, file.name);
    const { error } = await getSupabaseClient().storage.from(BUCKET_MUSIC).upload(fileName, file);
    if (error) throw new Error(`Failed to upload music file: ${error.message}`);

    const { data } = getSupabaseClient().storage.from(BUCKET_MUSIC).getPublicUrl(fileName);
    if (!data.publicUrl) throw new Error('Failed to generate public URL for music file');
    
    return data.publicUrl;
  },

  async delete(filePath: string) {
    const { error } = await getSupabaseClient().storage.from(BUCKET_MUSIC).remove([filePath]);
    if (error) throw new Error(`Failed to delete music file: ${error.message}`);
  },
};

/**
 * Database Functions for Gallery
 */
export const gallery = {
  async getFolders() {
    const { data: { user } } = await getSupabaseClient().auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const data = await selectWithOrder('gallery_folders', '*', [['user_id', user.id]]);
    return data || [];
  },

  async createFolder(name: string) {
    const { data: { user } } = await getSupabaseClient().auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await getSupabaseClient()
      .from('gallery_folders')
      .insert([{ name, user_id: user.id }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteFolder(id: string) {
    const { data: { user } } = await getSupabaseClient().auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await getSupabaseClient()
      .from('gallery_folders')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw error;
  },

  async getImages(folderId: string) {
    const { data: { user } } = await getSupabaseClient().auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const data = await selectWithOrder('gallery_images', '*', [['folder_id', folderId], ['user_id', user.id]]);
    // Normalize returned rows so UI always reads `file_url`.
    // Some schemas use `image_url`, others `file_url` depending on setup.
    const rows = Array.isArray(data) ? (data as unknown[]) : [];
    const normalized = rows.map((rowUnknown) => {
      const row = (rowUnknown ?? {}) as Record<string, unknown>;
      return {
        ...row,
        file_url:
          (row.file_url as string | null | undefined) ||
          (row.image_url as string | null | undefined) ||
          (row.url as string | null | undefined) ||
          null,
        uploaded_at:
          (row.uploaded_at as string | null | undefined) ||
          (row.created_at as string | null | undefined) ||
          null,
      };
    });
    return normalized;
  },

  async createImage(folderId: string, title: string, imageUrl: string) {
    const { data: { user } } = await getSupabaseClient().auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Attempt inserts that cover common schema variants. If a column is missing
    // (Postgres 42703), retry with alternate payload shapes.
    const client = getSupabaseClient();
    const inserts = [
      { folder_id: folderId, title, image_url: imageUrl, file_url: imageUrl, user_id: user.id },
      { folder_id: folderId, title, file_url: imageUrl, user_id: user.id },
      { folder_id: folderId, title, url: imageUrl, user_id: user.id },
      { folder_id: folderId, title, user_id: user.id },
    ];

    for (const payload of inserts) {
      const { data, error } = await client.from('gallery_images').insert([payload]).select().single();
      if (!error) {
        const row = data as Record<string, unknown>;
        return {
          ...row,
          file_url:
            (row.file_url as string | null | undefined) ||
            (row.image_url as string | null | undefined) ||
            (row.url as string | null | undefined) ||
            null,
          uploaded_at:
            (row.uploaded_at as string | null | undefined) ||
            (row.created_at as string | null | undefined) ||
            null,
        };
      }
      const errCode = (error as unknown as { code?: string }).code;
      if (errCode && String(errCode) === '42703') {
        continue; // missing column, try next
      }
      throw error;
    }
    throw new Error('Failed to insert gallery image: no compatible schema found');
  },

  // Compatibility wrapper: some components call `gallery.addImage(folderId, imageUrl, title)`
  // while the canonical method is `createImage(folderId, title, imageUrl)`.
  // Provide `addImage` to avoid runtime errors and preserve expected argument order.
  async addImage(folderId: string, imageUrl: string, title: string) {
    return await gallery.createImage(folderId, title, imageUrl);
  },

  async deleteImage(id: string) {
    const { data: { user } } = await getSupabaseClient().auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await getSupabaseClient()
      .from('gallery_images')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw error;
  },

  subscribeFolders(callback: (change: unknown) => void) {
    return getSupabaseClient()
      .channel('gallery_folders_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'gallery_folders',
        },
        (payload) => callback(payload),
      )
      .subscribe();
  },

  subscribeImages(folderId: string, callback: (change: unknown) => void) {
    return getSupabaseClient()
      .channel(`gallery_images_${folderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'gallery_images',
          filter: `folder_id=eq.${folderId}`,
        },
        (payload) => callback(payload),
      )
      .subscribe();
  },
};

/**
 * Storage Functions for Gallery Images
 */
export const galleryStorage = {
  async upload(file: File, userId: string, folderId: string): Promise<string> {
    const fileName = `${userId}/${folderId}/${Date.now()}_${file.name}`;
    const { error } = await getSupabaseClient().storage.from(BUCKET_GALLERY).upload(fileName, file);
    if (error) throw new Error(`Failed to upload gallery image: ${error.message}`);

    const { data } = getSupabaseClient().storage.from(BUCKET_GALLERY).getPublicUrl(fileName);
    if (!data.publicUrl) throw new Error('Failed to generate public URL for gallery image');
    
    return data.publicUrl;
  },

  async delete(filePath: string) {
    const { error } = await getSupabaseClient().storage.from(BUCKET_GALLERY).remove([filePath]);
    if (error) throw new Error(`Failed to delete gallery image: ${error.message}`);
  },
};

/**
 * Database Functions for Letters
 */
export const letters = {
  async getAll() {
    const { data: { user } } = await getSupabaseClient().auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const data = await selectWithOrder('letters', '*', [['user_id', user.id]]);
    return data || [];
  },

  async create(title: string, content: string, recipient?: string) {
    const { data: { user } } = await getSupabaseClient().auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await getSupabaseClient()
      .from('letters')
      .insert([{ title, content, recipient, user_id: user.id }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, title: string, content: string, recipient?: string) {
    const { data: { user } } = await getSupabaseClient().auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await getSupabaseClient()
      .from('letters')
      .update({ title, content, recipient, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string) {
    const { data: { user } } = await getSupabaseClient().auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await getSupabaseClient()
      .from('letters')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw error;
  },

  subscribe(callback: (change: unknown) => void) {
    return getSupabaseClient()
      .channel('letters_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'letters',
        },
        (payload) => callback(payload),
      )
      .subscribe();
  },
};
