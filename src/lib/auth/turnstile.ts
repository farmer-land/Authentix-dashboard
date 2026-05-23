/**
 * Cloudflare Turnstile server-side verification.
 *
 * Returns true when:
 *   - TURNSTILE_SECRET_KEY is not set (dev/staging — skip silently)
 *   - The token passes Cloudflare's siteverify API
 *   - The Cloudflare API is unreachable (fail open to avoid blocking real users)
 *
 * Returns false when:
 *   - TURNSTILE_SECRET_KEY is set but no token was submitted (bot submitted form directly)
 *   - Cloudflare explicitly marks the token as invalid
 */
export async function verifyTurnstile(formData: FormData): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) return true;

  const token = formData.get("cf-turnstile-response") as string | null;
  if (!token) return false;

  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: secretKey, response: token }),
        signal: AbortSignal.timeout(5000),
      }
    );

    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    // Cloudflare API unreachable — fail open so a Turnstile outage doesn't
    // lock real users out of their accounts.
    return true;
  }
}
