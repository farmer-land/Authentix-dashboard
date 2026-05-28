import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Auth callback handler — exchanges the PKCE code issued by Supabase
 * for a full session, then routes the user:
 *  - Invite link  → /accept-invite (creates org membership)
 *  - Normal login → /dashboard (or the ?next= param)
 *  - Failure      → /login?error=auth_failed
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Accumulate cookies set during exchangeCodeForSession so we can write them
  // directly onto the redirect response (NextResponse.redirect is a separate
  // response object — cookies written to next/headers cookieStore won't carry over).
  const cookiesToSet: Array<{ name: string; value: string; options?: object }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookies) { cookiesToSet.push(...cookies); },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    // PKCE exchange failed — most common cause is cross-device click.
    // The magic-callback page handles that case instead.
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Detect invite: Supabase stores invite metadata in user_metadata
  const inviteOrgId = data.user?.user_metadata?.invited_to_org_id as string | undefined;
  const target = inviteOrgId ? `${origin}/accept-invite` : `${origin}${next}`;

  const response = NextResponse.redirect(target);
  cookiesToSet.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
  );
  return response;
}
