/**
 * PROXY VALIDATORS
 *
 * Pure validation functions for the API proxy route handler.
 * Extracted here so they can be unit-tested independently of Next.js.
 *
 * Security model:
 *   - isPathSafe     — blocks traversal, double-slash, null-byte, and backslash attacks
 *   - isPathAllowed  — enforces strict prefix allowlist (SSRF prevention)
 */

// ── Allowed Methods ───────────────────────────────────────────────────────────

export const ALLOWED_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);

// ── Allowed Path Prefixes ─────────────────────────────────────────────────────

export const ALLOWED_PATH_PREFIXES = [
  "/auth/",
  "/templates",
  "/organizations/",
  "/users/",
  "/certificates/",
  "/import-jobs",
  "/billing/",
  "/verification/",
  "/dashboard/",
  "/webhooks/",
  "/industries",
  "/catalog/",
  "/delivery/",
  "/jobs/",
] as const;

// ── Hop-by-hop Headers ────────────────────────────────────────────────────────

export const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

// ── Path Validators ───────────────────────────────────────────────────────────

/**
 * Validates a path against common traversal and injection attacks.
 *
 * Blocks:
 *   - Directory traversal: `..`, `%2e%2e`
 *   - Double slashes:       `//`
 *   - Null bytes:           `%00`, `\0`
 *   - Backslashes:          `\`, `%5c`
 */
export function isPathSafe(path: string): boolean {
  if (path.includes("..")) return false;
  if (path.toLowerCase().includes("%2e%2e")) return false;
  if (path.includes("//")) return false;
  if (path.includes("%00")) return false;
  if (path.includes("\0")) return false;
  if (path.includes("\\")) return false;
  if (path.toLowerCase().includes("%5c")) return false;
  return true;
}

/**
 * Checks whether a path starts with one of the allowed backend prefixes.
 * Prevents SSRF by ensuring the proxy cannot be pointed at arbitrary backend paths.
 */
export function isPathAllowed(path: string): boolean {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return ALLOWED_PATH_PREFIXES.some(
    (prefix) =>
      normalizedPath.startsWith(prefix) ||
      normalizedPath === prefix.replace(/\/$/, ""),
  );
}

/**
 * Build a safe headers object for the backend request.
 * Strips hop-by-hop headers, removes the host header, and injects the auth token.
 */
export function createSafeHeaders(
  originalHeaders: Headers,
  accessToken: string | null,
): Headers {
  const safeHeaders = new Headers();

  originalHeaders.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    // Strip hop-by-hop headers
    if (HOP_BY_HOP_HEADERS.has(lowerKey)) return;
    // Strip host (set by fetch automatically)
    if (lowerKey === "host") return;
    // Strip origin — the proxy is a server-to-server hop; forwarding the browser's
    // origin causes the backend CORS policy to reject localhost in production.
    if (lowerKey === "origin") return;
    // Strip cookie (auth cookies forwarded separately as Authorization + Cookie)
    if (lowerKey === "cookie") return;
    // Preserve multipart Content-Type with boundary intact
    if (lowerKey === "content-type" && value.includes("multipart/form-data")) {
      safeHeaders.set(key, value);
      return;
    }
    safeHeaders.set(key, value);
  });

  if (accessToken) {
    safeHeaders.set("Authorization", `Bearer ${accessToken}`);
  }

  return safeHeaders;
}
