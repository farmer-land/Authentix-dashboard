import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const DASHBOARD_HOST = "dashboard.digicertificates.in";
const PUBLIC_HOST = "digicertificates.in";
const VERIFY_HOSTNAME = "verify.digicertificates.in";

const PUBLIC_ROUTES = ["/", "/login", "/signup", "/signup/success", "/forgot-password", "/reset-password", "/verify"];
const API_ROUTES = ["/api/"];
const STATIC_ROUTES = ["/_next/", "/favicon.ico", "/images/", "/fonts/"];

function buildCSP(nonce: string): string {
  const evalDirective = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'unsafe-inline' https://vercel.live https://checkout.razorpay.com${evalDirective}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' blob: data: https://*.supabase.co https://vercel.com https://*.vercel.com https://*.razorpay.com",
    "font-src 'self' data: https://fonts.gstatic.com https://vercel.live https://*.razorpay.com",
    "frame-src 'self' blob: https://*.supabase.co https://vercel.live https://*.razorpay.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.digicertificates.in https://*.razorpay.com",
    "object-src 'self' blob:",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
  ].join("; ");
}


export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const isVerifyDomain = host === VERIFY_HOSTNAME || host.startsWith(`${VERIFY_HOSTNAME}:`);

  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  const nonce = btoa(String.fromCharCode(...array));

  // ── verify subdomain: all public, no auth ────────────────────────────────
  if (isVerifyDomain) {
    if (STATIC_ROUTES.some((r) => pathname.startsWith(r)) || API_ROUTES.some((r) => pathname.startsWith(r))) {
      return NextResponse.next();
    }
    const url = request.nextUrl.clone();
    if (pathname === "/") {
      url.pathname = "/verify";
      return NextResponse.rewrite(url);
    }
    if (pathname.startsWith("/verify")) return NextResponse.next();
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length === 2) {
      url.pathname = `/verify/${parts[1]}`;
      return NextResponse.rewrite(url);
    }
    url.pathname = "/verify";
    return NextResponse.rewrite(url);
  }

  // Redirect verify/short-link paths on dashboard subdomain to public domain
  if (host === DASHBOARD_HOST && (pathname.startsWith("/verify/") || pathname.startsWith("/c/"))) {
    const search = request.nextUrl.search;
    return NextResponse.redirect(`https://${PUBLIC_HOST}${pathname}${search}`, { status: 301 });
  }

  // Static assets: no auth needed, no nonce overhead
  if (STATIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  // ── Supabase session check (runs for ALL routes including /api/*) ─────────
  // getUser() validates the JWT and refreshes if expired.
  // The access token is then forwarded as x-supabase-access-token so that
  // Route Handlers (which can't reliably call getSession() on their own) can
  // read it directly from request headers via headers() from next/headers.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const isAuthenticated = !!user;

  // Read the session to get the raw access token for forwarding.
  // getSession() works reliably in proxy/edge context (request.cookies based).
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token ?? null;

  // Helper: build a nonce+token response, copying any refreshed Supabase cookies
  function nonceResponse(): NextResponse {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    if (accessToken) requestHeaders.set("x-supabase-access-token", accessToken);
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", buildCSP(nonce));
    supabaseResponse.cookies.getAll().forEach((cookie) => res.cookies.set(cookie));
    return res;
  }

  // API routes: apply nonce + token header but skip auth redirect
  if (API_ROUTES.some((r) => pathname.startsWith(r))) {
    return nonceResponse();
  }

  // /verify/* is always public (old QR codes point here)
  if (pathname.startsWith("/verify/")) {
    return nonceResponse();
  }

  // /auth/* routes must be public — they SET the session (PKCE exchange, magic link
  // callback). Blocking them while unauthenticated breaks the entire login flow:
  // the middleware would redirect /auth/callback to /login before the code can be
  // exchanged, consuming the Supabase token and invalidating the OTP.
  if (pathname.startsWith("/auth/")) {
    return nonceResponse();
  }

  // Public routes
  if (PUBLIC_ROUTES.includes(pathname)) {
    if (isAuthenticated && (pathname === "/login" || pathname === "/signup")) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return nonceResponse();
  }

  // Protected routes
  if (!isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // /dashboard exact — let page handle org resolution
  if (pathname === "/dashboard") {
    return nonceResponse();
  }

  // Legacy /dashboard/* without org slug — redirect to resolver
  if (pathname.startsWith("/dashboard/") && !pathname.startsWith("/dashboard/org/")) {
    const response = NextResponse.redirect(new URL("/dashboard", request.url));
    response.cookies.set("redirect_path", pathname, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60,
    });
    return response;
  }

  return nonceResponse();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
