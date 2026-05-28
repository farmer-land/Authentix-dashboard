/**
 * ENVIRONMENT CONFIGURATION
 *
 * Controls which backend the Next.js proxy talks to.
 *
 * In production on Railway (preferred — private networking):
 *   Set BACKEND_URL to the Railway-internal URL, e.g.:
 *     BACKEND_URL=http://authentix-backend.railway.internal:3001/api/v1
 *   This keeps traffic on Railway's private network (faster, free egress, never
 *   publicly reachable). Never prefix with NEXT_PUBLIC_ — internal URLs must
 *   not appear in the client bundle.
 *
 * In production on Vercel (fallback — public URL):
 *   Set NEXT_PUBLIC_API_URL to the public Railway backend URL, e.g.:
 *     NEXT_PUBLIC_API_URL=https://api.digicertificates.in/api/v1
 *
 * In local dev:
 *   Set BACKEND_URL=https://api-staging.up.railway.app/api/v1 in .env.local
 *   to proxy to Railway staging instead of starting a local backend.
 */

// BACKEND_URL is checked first — it is server-only (no NEXT_PUBLIC_ prefix)
// and should point to the Railway private URL in production.
// NEXT_PUBLIC_API_URL is the public fallback (Vercel / local-dev convenience).
export const BACKEND_PRIMARY_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3001/api/v1";

// No automatic fallback to a remote URL — a missing BACKEND_URL surfaces
// clearly instead of silently proxying to a dead or wrong environment.
export const BACKEND_FALLBACK_URL = "";

/** True if the error is a connection refused (local backend not running) */
export function isConnectionRefused(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const cause = (error as { cause?: { code?: string } }).cause;
  return (
    cause?.code === "ECONNREFUSED" ||
    error.message.includes("ECONNREFUSED") ||
    error.message.includes("fetch failed")
  );
}
