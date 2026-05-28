/**
 * NEXT.JS MIDDLEWARE — Supabase session refresh
 *
 * Required by @supabase/ssr: runs on every non-static request to ensure
 * the Supabase access token is refreshed before it expires and the updated
 * cookies are written into the response. Without this, the browser client
 * can't read the session right after the PKCE auth callback, causing every
 * client-side apiRequest to send no X-Supabase-Token and the proxy to fall
 * back to a cookie read that also returns null → 401 on all API calls.
 */

import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write updated cookies back to both the request (for in-flight Server
          // Components that run after middleware) and the response (for the browser).
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do NOT use getSession() here — it doesn't trigger a token refresh.
  // getUser() validates the token against the Supabase Auth server and refreshes
  // it if it's within the rotation window, then calls setAll() to persist the
  // updated cookies in supabaseResponse.
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Run on every route EXCEPT Next.js internals and static files.
    // The negative lookahead keeps _next/static, _next/image, and asset files fast.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
};
