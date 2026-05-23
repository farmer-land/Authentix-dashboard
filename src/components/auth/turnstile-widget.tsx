"use client";

import Script from "next/script";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/**
 * Cloudflare Turnstile challenge widget.
 *
 * Renders only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set — a no-op in dev
 * or staging environments where the key is absent. The widget auto-injects
 * a hidden input named "cf-turnstile-response" into the nearest <form>, which
 * the server action reads and verifies via verifyTurnstile().
 */
export function TurnstileWidget() {
  if (!SITE_KEY) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="lazyOnload"
      />
      <div
        className="cf-turnstile"
        data-sitekey={SITE_KEY}
        data-theme="auto"
      />
    </>
  );
}
