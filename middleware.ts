import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') ?? '';

  // Rewrite verify.digicertificates.in/{slug}/{token} and /{token} to /verify/{token}
  // QR codes embed the org slug in the URL (e.g. /xencus/TOKEN or /abnugtcdocqkntjqmbwb/TOKEN).
  // The verify page only needs the token — extract the last path segment.
  if (hostname.startsWith('verify.')) {
    const path = request.nextUrl.pathname;

    // Pass through Next.js internals, static assets, and API routes unchanged
    if (
      path.startsWith('/_next') ||
      path.startsWith('/api') ||
      path.startsWith('/monitoring') ||
      path === '/' ||
      path === '/favicon.ico'
    ) {
      return NextResponse.next();
    }

    const segments = path.split('/').filter(Boolean);
    if (segments.length >= 1) {
      const token = segments[segments.length - 1]!;
      const url = request.nextUrl.clone();
      url.pathname = `/verify/${token}`;
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
