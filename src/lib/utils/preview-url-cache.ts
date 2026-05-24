/**
 * localStorage-backed cache for signed preview URLs.
 *
 * Design rationale:
 * - Backend generates signed URLs with 7-day expiry. We cache them for 6 days
 *   so the frontend always uses a stable URL string. A stable URL → the browser
 *   can cache the image response by URL → zero egress after first load.
 * - Survives page reloads and tab navigation (unlike the old in-memory Map).
 * - Old signed URLs remain valid even after a backend restart generates new
 *   ones (Supabase honours the JWT until its expiry, regardless of whether
 *   the backend still knows about it).
 * - In-flight deduplication prevents concurrent fetches for the same template
 *   when loadAllPreviews runs N parallel requests on cold cache.
 */

const LS_PREFIX = "authentix:preview:";
const CACHE_TTL_MS = 6 * 24 * 60 * 60 * 1000; // 6 days

interface CacheEntry {
  url: string;
  expiresAt: number; // ms epoch
}

// In-flight deduplication map — cleared when each promise settles
const inFlight = new Map<string, Promise<string | null>>();

function lsGet(key: string): string | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() > entry.expiresAt) {
      localStorage.removeItem(LS_PREFIX + key);
      return null;
    }
    return entry.url;
  } catch {
    return null;
  }
}

function lsSet(key: string, url: string): void {
  try {
    const entry: CacheEntry = { url, expiresAt: Date.now() + CACHE_TTL_MS };
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(entry));
  } catch {
    // localStorage may be full or unavailable in private browsing — silently ignore
  }
}

export function getCachedPreviewUrl(key: string): string | null {
  return lsGet(key);
}

export function cachePreviewUrl(key: string, url: string): void {
  lsSet(key, url);
}

export function getPreviewCacheKey(
  templateId: string,
  previewFileId?: string | null,
  previewBucket?: string | null,
  previewPath?: string | null,
): string {
  if (previewFileId) return `template:${templateId}:file:${previewFileId}`;
  if (previewBucket && previewPath) return `template:${templateId}:bucket:${previewBucket}:path:${previewPath}`;
  return `template:${templateId}`;
}

export function clearPreviewCache(templateId: string): void {
  try {
    const prefix = LS_PREFIX + `template:${templateId}:`;
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

/**
 * Wrap an async URL fetch in per-key in-flight deduplication.
 * Concurrent callers for the same key share one promise instead of racing.
 */
export function dedupePreviewFetch(
  key: string,
  fetcher: () => Promise<string | null>,
): Promise<string | null> {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const promise = fetcher().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}
