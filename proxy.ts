import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_COOKIE = "auth_access_token";

// Redirect /verify/* and /c/* on the dashboard subdomain to the public domain
// so recipients see digicertificates.in/verify/TOKEN, not dashboard.digicertificates.in/verify/TOKEN.
const DASHBOARD_HOST = "dashboard.digicertificates.in";
const PUBLIC_HOST = "digicertificates.in";

const PUBLIC_ROUTES = ["/", "/login", "/signup", "/signup/success", "/forgot-password", "/reset-password", "/verify"];
const API_ROUTES = ["/api/"];
const STATIC_ROUTES = ["/_next/", "/favicon.ico", "/images/", "/fonts/"];

/**
 * CSP NONCE
 *
 * Generates a per-request nonce and injects it into the Content-Security-Policy
 * response header. The nonce is also forwarded as `x-nonce` on the request so
 * that server components can attach it to inline <script> tags.
 *
 * Security notes:
 * - `unsafe-eval` is intentionally absent — Next.js production builds do not need it.
 * - `unsafe-inline` is retained as a legacy fallback only. Per CSP Level 3, browsers
 *   that honour nonces will ignore `unsafe-inline` when a valid nonce is present.
 *   Remove `unsafe-inline` once all inline scripts carry the nonce.
 * - style-src keeps `unsafe-inline` — Tailwind/shadcn styles are currently inline.
 */
function buildCSP(nonce: string): string {
  // React dev mode uses eval() for stack trace reconstruction — safe to allow in dev only.
  const evalDirective = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'unsafe-inline' https://vercel.live https://checkout.razorpay.com${evalDirective}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' blob: data: https://*.supabase.co https://vercel.com https://*.vercel.com https://*.razorpay.com",
    "font-src 'self' data: https://fonts.gstatic.com https://vercel.live",
    "frame-src 'self' blob: https://*.supabase.co https://vercel.live https://api.razorpay.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.digicertificates.in https://api.razorpay.com https://lumberjack.razorpay.com",
    "object-src 'self' blob:",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
  ].join("; ");
}

function nextWithNonce(request: NextRequest, nonce: string): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", buildCSP(nonce));
  return response;
}

const VERIFY_HOSTNAME = "verify.digicertificates.in";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const isVerifyDomain = host === VERIFY_HOSTNAME || host.startsWith(`${VERIFY_HOSTNAME}:`);

  // Generate nonce once up-front — used by nextWithNonce throughout this handler.
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  const nonce = btoa(String.fromCharCode(...array));

  // ── verify.digicertificates.in domain routing ────────────────────────────
  // All traffic on the verify subdomain is public — no auth checks needed.
  if (isVerifyDomain) {
    // Let Next.js internal routes (_next, API, static assets) pass through untouched.
    if (
      STATIC_ROUTES.some((r) => pathname.startsWith(r)) ||
      API_ROUTES.some((r) => pathname.startsWith(r))
    ) {
      return nextWithNonce(request, nonce);
    }

    const url = request.nextUrl.clone();
    if (pathname === "/") {
      url.pathname = "/verify";
      return NextResponse.rewrite(url);
    }
    // Already under /verify/... — serve normally (backward compat with old QR codes)
    if (pathname.startsWith("/verify")) return NextResponse.next();
    // New format: /{orgSlug}/{token} → rewrite to /verify/{token}
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length === 2) {
      url.pathname = `/verify/${parts[1]}`;
      return NextResponse.rewrite(url);
    }
    url.pathname = "/verify";
    return NextResponse.rewrite(url);
  }

  // Redirect verify/short-link paths on the dashboard subdomain to the clean public domain
  if (host === DASHBOARD_HOST && (pathname.startsWith("/verify/") || pathname.startsWith("/c/"))) {
    const search = request.nextUrl.search;
    return NextResponse.redirect(`https://${PUBLIC_HOST}${pathname}${search}`, { status: 301 });
  }

  // Skip auth checks for static/API routes but still apply CSP
  if (STATIC_ROUTES.some((r) => pathname.startsWith(r)) || API_ROUTES.some((r) => pathname.startsWith(r))) {
    return nextWithNonce(request, nonce);
  }

  const hasAuthCookie = request.cookies.has(AUTH_COOKIE);

  // Public routes
  if (PUBLIC_ROUTES.includes(pathname)) {
    if (hasAuthCookie && (pathname === "/login" || pathname === "/signup")) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return nextWithNonce(request, nonce);
  }

  // /verify/* is always public — old QR codes point to digicertificates.in/verify/TOKEN
  if (pathname.startsWith('/verify/')) {
    return nextWithNonce(request, nonce);
  }

  // Protected routes need auth
  if (!hasAuthCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // /dashboard exact - let page handle org resolution
  if (pathname === "/dashboard") {
    return nextWithNonce(request, nonce);
  }

  // Legacy /dashboard/* routes without org - redirect to resolver
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

  return nextWithNonce(request, nonce);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
