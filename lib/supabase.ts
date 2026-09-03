import { AuthError, User, SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

const BUCKET_MUSIC = 'music-files';
const BUCKET_GALLERY = 'gallery-images';

let supabaseClient: SupabaseClient | null = null;

// --- Media reference guards: buckets are PRIVATE, so `file_url` holds either a
// storage PATH (new uploads) or a legacy absolute URL. Old rows may also hold
// file:// or empty values.
export function isPlayableHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!v) return false;
  if (/^(file:|blob:|data:)/i.test(v)) return false;
  return /^https?:\/\//i.test(v);
}

const STORAGE_PATH_RE = /^[A-Za-z0-9_][A-Za-z0-9_.\-/]*\.[A-Za-z0-9]{2,5}$/;

/** Bare private-bucket object path, e.g. `<userId>/123_abc_track.mp3`. */
export function isStoragePath(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!v || v.length > 512 || !v.includes('/')) return false;
  if (/[\s:]/.test(v)) return false;
  return STORAGE_PATH_RE.test(v);
}

function getCurrentProjectHost(): string | null {
  try {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!base) return null;
    return new URL(base).host;
  } catch {
    return null;
  }
}

export type UrlState = 'current' | 'external' | 'stale' | 'invalid';

/**
 * Classify a stored file reference.
 * - 'stale': absolute URL pointing at a *different* Supabase project
 *   (project moved, old host dead). Never attempt loading — show re-upload UI.
 * - 'external': non-Supabase http(s) URL, safe to try loading.
 * - 'current': this project's private storage (bare path or current-host URL).
 *   Resolve via signed URL before loading.
 * - 'invalid': empty / file:// / blob: / data: / other.
 */
export function classifyFileUrl(value: unknown): UrlState {
  if (isStoragePath(value)) return 'current';
  if (!isPlayableHttpUrl(value)) return 'invalid';
  let host: string;
  try {
    host = new URL(value as string).host;
  } catch {
    return 'invalid';
  }
  if (!host.endsWith('.supabase.co')) return 'external';
  const current = getCurrentProjectHost();
  if (!current) return 'current';
  return host === current ? 'current' : 'stale';
}

/** Loadable in a player/<img>: current-project or external URLs only. */
export function isLoadableFileUrl(value: unknown): value is string {
  const state = classifyFileUrl(value);
  return state === 'current' || state === 'external';
}

// --- Private-bucket signed URLs -------------------------------------------
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Extract the object path for `bucket` from a stored reference.
 * Accepts bare paths and absolute Supabase URLs
 * (`/storage/v1/object/public|sign|authenticated/<bucket>/<path>`).
 * Returns null for stale-host URLs and anything unparseable.
 */
export function extractStorageRef(bucket: string, stored: unknown): string | null {
  if (isStoragePath(stored)) return (stored as string).trim();
  if (typeof stored !== 'string') return null;
  const v = stored.trim();
  if (!v) return null;
  const m = v.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/(.+?)(?:[?#]|$)/);
  if (!m || m[1] !== bucket) return null;
  // Refuse cross-project URLs: those files were never migrated.
  if (/^https?:\/\//i.test(v)) {
    let host = '';
    try {
      host = new URL(v).host;
    } catch {
      return null;
    }
    const current = getCurrentProjectHost();
    if (host.endsWith('.supabase.co') && current && host !== current) return null;
  }
  try {
    return decodeURIComponent(m[2]);
  } catch {
    return m[2];
  }
}

async function createSignedUrl(bucket: string, stored: unknown): Promise<string | null> {
  const path = extractStorageRef(bucket, stored);
  if (!path) return null;
  const key = `${bucket}:${path}`;
  const cached = signedUrlCache.get(key);
  if (cached && Date.now() < cached.expiresAt - 10 * 60 * 1000) return cached.url;
  const { data, error } = await getSupabaseClient()
    .storage.from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  signedUrlCache.set(key, { url: data.signedUrl, expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000 });
  return data.signedUrl;
}

/** Resolve a stored music `file_url` (path or URL) to a playable signed URL. */
export function resolveMusicUrl(stored: unknown): Promise<string | null> {
  if (typeof stored === 'string' && classifyFileUrl(stored) === 'external') return Promise.resolve(stored);
  return createSignedUrl(BUCKET_MUSIC, stored);
}

/** Resolve a stored gallery `file_url` (path or URL) to a viewable signed URL. */
export function resolveImageUrl(stored: unknown): Promise<string | null> {
  if (typeof stored === 'string' && classifyFileUrl(stored) === 'external') return Promise.resolve(stored);
  return createSignedUrl(BUCKET_GALLERY, stored);
}

/** Drop a cached signed URL (e.g. after delete). */
export function dropCachedMediaUrl(bucket: 'music' | 'gallery', stored: unknown) {
  const path = extractStorageRef(bucket === 'music' ? BUCKET_MUSIC : BUCKET_GALLERY, stored);
  if (path) signedUrlCache.delete(`${bucket === 'music' ? BUCKET_MUSIC : BUCKET_GALLERY}:${path}`);
}

function isLockError(error: unknown) {
  const message = String((error as { message?: unknown } | null | undefined)?.message || error);
  return (
    message.includes('LockAcquireTimeoutError') ||
    message.includes('NavigatorLockAcquireTimeoutError') ||
    message.includes('Acquiring an exclusive Navigator LockManager lock')
  );
}

/** Retry helper for Supabase auth calls that can lose the Navigator Lock race. */
export async function withAuthRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isLockError(error) || attempt === retries) throw error;
      const delay = 150 * 2 ** attempt + Math.random() * 100;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// --- Cached user to avoid redundant auth.getUser() calls ---
let cachedUser: User | null = null;
let userFetchPromise: Promise<User | null> | null = null;
let userCacheExpiry = 0;
const USER_CACHE_TTL = 30_000; // 30 seconds

function isInvalidRefreshTokenError(error: unknown) {
  const message = String((error as { message?: unknown } | null | undefined)?.message || error);
  return message.includes('Invalid Refresh Token') || message.includes('Refresh Token Not Found');
}

async function clearLocalSession() {
  try {
    await getSupabaseClient().auth.signOut({ scope: 'local' });
  } catch {
    // ignore
  }
  cachedUser = null;
  userCacheExpiry = 0;
}

export async function getCachedUser(): Promise<User | null> {
  const now = Date.now();

  // Return cached user if still fresh
  if (cachedUser && now < userCacheExpiry) return cachedUser;

  // Deduplicate concurrent calls
  if (userFetchPromise) return userFetchPromise;

  userFetchPromise = (async () => {
    try {
      const { data, error } = await withAuthRetry(() => getSupabaseClient().auth.getUser());
      if (error && isInvalidRefreshTokenError(error)) {
        await clearLocalSession();
        return null;
      }
      if (error) throw error;
      cachedUser = data.user || null;
      userCacheExpiry = Date.now() + USER_CACHE_TTL;
      return cachedUser;
    } catch (error) {
      if (isInvalidRefreshTokenError(error)) {
        await clearLocalSession();
        return null;
      }
      // Lock contention: keep previous cache instead of crashing callers
      if (isLockError(error) && cachedUser) return cachedUser;
      throw error;
    } finally {
      userFetchPromise = null;
    }
  })();

  return userFetchPromise;
}

/** Invalidate user cache (e.g. after login/logout). */
export function invalidateUserCache() {
  cachedUser = null;
  userCacheExpiry = 0;
}

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

// --- Simple client-side data cache ---
interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const dataCache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL = 15_000; // 15 seconds for reads

function cacheKey(table: string, filters: Array<[string, unknown]>): string {
  return `${table}:${filters.map(([k, v]) => `${k}=${String(v)}`).join('&')}`;
}

function getCachedData<T>(key: string): T | null {
  const entry = dataCache.get(key) as CacheEntry<T> | undefined;
  if (entry && Date.now() < entry.expiry) return entry.data;
  if (entry) dataCache.delete(key);
  return null;
}

function setCachedData<T>(key: string, data: T) {
  dataCache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

function invalidateCache(table: string) {
  for (const key of dataCache.keys()) {
    if (key.startsWith(`${table}:`)) dataCache.delete(key);
  }
}

/** Clear the entire client-side data cache (used when refreshing after mutations). */
export function clearDataCache() {
  dataCache.clear();
}

/**
 * Simple select with per-table ordering preference, then no ordering.
 * The order columns are tried in sequence — pass the known timestamp column
 * first so no failed (400) probe request is ever sent. Max 3 requests.
 */
async function smartSelect(
  table: string,
  selectCols = '*',
  filters: Array<[string, unknown]> = [],
  orderCols: string[] = ['created_at', 'uploaded_at'],
) {
  const client = getSupabaseClient();

  for (const col of orderCols) {
    let builder = client.from(table).select(selectCols);
    for (const [k, v] of filters) builder = builder.eq(k, v);
    const res = await builder.order(col, { ascending: false });
    if (!res.error) return res.data || [];
    const code = (res.error as unknown as { code?: string }).code;
    // Column doesn't exist — try the next ordering. Anything else is real.
    if (code !== '42703' && code !== '42P01' && code) throw res.error;
  }

  // Still failing (or no order column worked) — try with no ordering at all
  let plain = client.from(table).select(selectCols);
  for (const [k, v] of filters) plain = plain.eq(k, v);
  const plainRes = await plain;
  if (plainRes.error) throw plainRes.error;
  return plainRes.data || [];
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
    invalidateUserCache();
    return { user: data.user, error };
  },

  async login(email: string, password: string): Promise<{ user: User | null; error: AuthError | null }> {
    const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
    invalidateUserCache();
    return { user: data.user, error };
  },

  async logout(): Promise<{ error: AuthError | null }> {
    const { error } = await getSupabaseClient().auth.signOut();
    invalidateUserCache();
    dataCache.clear();
    return { error };
  },

  async getUser(): Promise<User | null> {
    return getCachedUser();
  },

  async getSession() {
    const { data } = await withAuthRetry(() => getSupabaseClient().auth.getSession());
    return data.session;
  },

  onAuthStateChange(callback: (user: User | null) => void) {
    return getSupabaseClient().auth.onAuthStateChange((_event, session) => {
      invalidateUserCache();
      callback(session?.user || null);
    });
  },
};

/**
 * Database Functions for Notes
 */
export const notes = {
  async getAll() {
    const user = await getCachedUser();
    if (!user) throw new Error('Not authenticated');

    const key = cacheKey('notes', [['user_id', user.id]]);
    const cached = getCachedData(key);
    if (cached) return cached;

    const data = await smartSelect('notes', '*', [['user_id', user.id]]);
    setCachedData(key, data);
    return data;
  },

  async create(title: string, content: string) {
    const user = await getCachedUser();
    if (!user) throw new Error('Not authenticated');

    invalidateCache('notes');
    const { data, error } = await getSupabaseClient()
      .from('notes')
      .insert([{ title, content, user_id: user.id }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, title: string, content: string) {
    const user = await getCachedUser();
    if (!user) throw new Error('Not authenticated');

    invalidateCache('notes');
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
    const user = await getCachedUser();
    if (!user) throw new Error('Not authenticated');

    invalidateCache('notes');
    const { error } = await getSupabaseClient()
      .from('notes')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw error;
  },
};

/**
 * Database Functions for Music
 */
export const music = {
  async getAll() {
    const user = await getCachedUser();
    if (!user) throw new Error('Not authenticated');

    const key = cacheKey('music_tracks', [['user_id', user.id]]);
    const cached = getCachedData(key);
    if (cached) return cached;

    const data = await smartSelect('music_tracks', '*', [['user_id', user.id]]);
    setCachedData(key, data);
    return data;
  },

  async create(title: string, artist: string, fileUrl: string) {
    const user = await getCachedUser();
    if (!user) throw new Error('Not authenticated');

    invalidateCache('music_tracks');
    const { data, error } = await getSupabaseClient()
      .from('music_tracks')
      .insert([{ title, artist, file_url: fileUrl, user_id: user.id }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string) {
    const user = await getCachedUser();
    if (!user) throw new Error('Not authenticated');

    invalidateCache('music_tracks');
    const { error } = await getSupabaseClient()
      .from('music_tracks')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw error;
  },
};

/**
 * Storage Functions for Music Files (PRIVATE bucket).
 * Uploads return the object PATH — callers store it in `file_url` and the
 * player resolves a signed URL at play time via resolveMusicUrl().
 */
export const musicStorage = {
  async upload(file: File, userId: string): Promise<string> {
    if (!file.name.toLowerCase().endsWith('.mp3')) {
      throw new Error('Only MP3 files are allowed');
    }
    const fileName = buildMusicStorageKey(userId, file.name);
    const { error } = await getSupabaseClient().storage.from(BUCKET_MUSIC).upload(fileName, file);
    if (error) throw new Error(`Failed to upload music file: ${error.message}`);

    invalidateCache('music_tracks');
    return fileName;
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
    const user = await getCachedUser();
    if (!user) throw new Error('Not authenticated');

    const key = cacheKey('gallery_folders', [['user_id', user.id]]);
    const cached = getCachedData(key);
    if (cached) return cached;

    const data = await smartSelect('gallery_folders', '*', [['user_id', user.id]]);
    setCachedData(key, data);
    return data;
  },

  async createFolder(name: string) {
    const user = await getCachedUser();
    if (!user) throw new Error('Not authenticated');

    invalidateCache('gallery_folders');
    const { data, error } = await getSupabaseClient()
      .from('gallery_folders')
      .insert([{ name, user_id: user.id }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteFolder(id: string) {
    const user = await getCachedUser();
    if (!user) throw new Error('Not authenticated');

    invalidateCache('gallery_folders');
    invalidateCache('gallery_images');
    const { error } = await getSupabaseClient()
      .from('gallery_folders')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw error;
  },

  async getImages(folderId: string) {
    const user = await getCachedUser();
    if (!user) throw new Error('Not authenticated');

    const key = cacheKey('gallery_images', [['folder_id', folderId], ['user_id', user.id]]);
    const cached = getCachedData(key);
    if (cached) return cached;

    // gallery_images has uploaded_at (no created_at) — order by it first so no
    // failed probe request is sent.
    const data = await smartSelect('gallery_images', '*', [['folder_id', folderId], ['user_id', user.id]], ['uploaded_at', 'created_at']);
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
    setCachedData(key, normalized);
    return normalized;
  },

  async getAllImages() {
    const user = await getCachedUser();
    if (!user) throw new Error('Not authenticated');

    const key = cacheKey('gallery_images', [['user_id', user.id]]);
    const cached = getCachedData(key);
    if (cached) return cached;

    const data = await smartSelect('gallery_images', '*', [['user_id', user.id]], ['uploaded_at', 'created_at']);
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
    setCachedData(key, normalized);
    return normalized;
  },

  async createImage(folderId: string, title: string, imageUrl: string) {
    const user = await getCachedUser();
    if (!user) throw new Error('Not authenticated');

    invalidateCache('gallery_images');
    const { data, error } = await getSupabaseClient()
      .from('gallery_images')
      .insert([{ folder_id: folderId, title, file_url: imageUrl, user_id: user.id }])
      .select()
      .single();
    if (error) throw error;
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
  },

  async addImage(folderId: string, imageUrl: string, title: string) {
    return await gallery.createImage(folderId, title, imageUrl);
  },

  async deleteImage(id: string) {
    const user = await getCachedUser();
    if (!user) throw new Error('Not authenticated');

    invalidateCache('gallery_images');
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
        { event: '*', schema: 'public', table: 'gallery_folders' },
        (payload) => {
          invalidateCache('gallery_folders');
          callback(payload);
        },
      )
      .subscribe();
  },

  subscribeImages(folderId: string, callback: (change: unknown) => void) {
    return getSupabaseClient()
      .channel(`gallery_images_${folderId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gallery_images', filter: `folder_id=eq.${folderId}` },
        (payload) => {
          invalidateCache('gallery_images');
          callback(payload);
        },
      )
      .subscribe();
  },
};

/**
 * Storage Functions for Gallery Images (PRIVATE bucket).
 * Uploads return the object PATH — callers store it in `file_url` and views
 * resolve a signed URL via resolveImageUrl() (client) or server-side signing.
 */
export const galleryStorage = {
  async upload(file: File, userId: string, folderId: string): Promise<string> {
    const ext = file.name.toLowerCase().match(/\.[^./\\]+$/)?.[0] || '';
    const allowed = ['.png', '.jpg', '.jpeg'];
    if (!allowed.includes(ext)) {
      throw new Error('Only PNG and JPG/JPEG images are allowed');
    }
    const base = file.name.slice(0, -ext.length) || 'photo';
    const safeBase = safeStorageSegment(base) || 'photo';
    const fileName = `${safeStorageSegment(userId)}/${safeStorageSegment(folderId)}/${Date.now()}_${safeBase}${ext}`;
    const { error } = await getSupabaseClient().storage.from(BUCKET_GALLERY).upload(fileName, file, {
      contentType: file.type || undefined,
    });
    if (error) throw new Error(`Failed to upload gallery image: ${error.message}`);

    invalidateCache('gallery_images');
    return fileName;
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
    const user = await getCachedUser();
    if (!user) throw new Error('Not authenticated');

    const key = cacheKey('letters', [['user_id', user.id]]);
    const cached = getCachedData(key);
    if (cached) return cached;

    const data = await smartSelect('letters', '*', [['user_id', user.id]]);
    setCachedData(key, data);
    return data;
  },

  async create(title: string, content: string, recipient?: string) {
    const user = await getCachedUser();
    if (!user) throw new Error('Not authenticated');

    invalidateCache('letters');
    const { data, error } = await getSupabaseClient()
      .from('letters')
      .insert([{ title, content, recipient, user_id: user.id }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, title: string, content: string, recipient?: string) {
    const user = await getCachedUser();
    if (!user) throw new Error('Not authenticated');

    invalidateCache('letters');
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
    const user = await getCachedUser();
    if (!user) throw new Error('Not authenticated');

    invalidateCache('letters');
    const { error } = await getSupabaseClient()
      .from('letters')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw error;
  },
};
