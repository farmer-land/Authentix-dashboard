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
 *
 *   If BACKEND_URL is left pointing at localhost and no local backend is running,
 *   requests fall back to the deployed Railway backend automatically — see
 *   BACKEND_FALLBACK_URL below. That fallback writes to the PRODUCTION database.
 */

// BACKEND_URL is checked first — it is server-only (no NEXT_PUBLIC_ prefix)
// and should point to the Railway private URL in production.
// NEXT_PUBLIC_API_URL is the public fallback (Vercel / local-dev convenience).
export const BACKEND_PRIMARY_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3001/api/v1";

// The deployed backend, used as the development-only fallback below.
const DEPLOYED_BACKEND_URL = "https://api.digicertificates.in/api/v1";

/**
 * Fallback backend, used only when the primary is unreachable.
 *
 * ON automatically in development so `npm run dev` works with no local backend
 * running and nothing to configure — requested by Heisenberg twice. Set
 * BACKEND_FALLBACK_URL to point somewhere else (or to "" to disable).
 *
 * Hard OFF in production builds. A deployed dashboard that silently proxied to
 * a different environment when its own backend blipped would be an outage-class
 * bug, so there is deliberately no way to switch it on there.
 *
 * The original concern here — that a silent fallback hides which environment you
 * are really talking to — still stands and is not solved by disabling this. It is
 * solved by making the fallback loud: every request that uses it logs at `warn`
 * with the URL actually used. Note what that warning means: while the fallback is
 * active, writes from your local dashboard land in the PRODUCTION database.
 */
export const BACKEND_FALLBACK_URL =
  process.env.NODE_ENV === "production"
    ? ""
    : (process.env.BACKEND_FALLBACK_URL ?? DEPLOYED_BACKEND_URL);

/**
 * Error codes that prove the TCP connection was never established: DNS never
 * resolved, or the peer refused the socket. The request bytes were never sent,
 * so the server cannot have received or acted on them.
 *
 * Deliberately excludes ECONNRESET. A reset is ambiguous — it can arrive after
 * the server accepted the request and acted on it, and re-sending a POST in that
 * case risks a duplicate write. If a code cannot be shown to be definitely
 * pre-send, it does not belong in this set.
 */
const PRE_SEND_ERROR_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"]);

/**
 * True only if the request provably never reached the backend, making it safe to
 * re-send for ANY method — including POST/PUT/PATCH/DELETE.
 *
 * Matches strictly on `error.cause.code`, never on the message text: a bare
 * "fetch failed" carries no information about how far the request got.
 */
export function isPreSendConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const cause = (error as { cause?: { code?: string } }).cause;
  return typeof cause?.code === "string" && PRE_SEND_ERROR_CODES.has(cause.code);
}

/**
 * True if the error looks like the local backend not running.
 *
 * Broad by design — matches on message text as well as `cause.code`, so it can
 * catch failures that carry no structured cause. That breadth makes it unsafe as
 * a retry gate for non-idempotent methods; use isPreSendConnectionError() for
 * anything that re-sends a request.
 */
export function isConnectionRefused(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const cause = (error as { cause?: { code?: string } }).cause;
  return (
    cause?.code === "ECONNREFUSED" ||
    error.message.includes("ECONNREFUSED") ||
    error.message.includes("fetch failed")
  );
}
