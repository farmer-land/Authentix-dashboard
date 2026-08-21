import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Auth callback handler — exchanges the PKCE code issued by Supabase
 * for a full session, then routes the user:
 *  - Invite link  → /accept-invite (creates org membership)
 *  - Normal login → /dashboard (or the ?next= param)
 *  - Failure      → /login?error=auth_failed
 *  - Reused/expired code (GARDEN-27) → /login?notice=link_already_used
 *    A PKCE code is single-use. If the user already completed the exchange
 *    once (e.g. clicked the emailed link, then the OTP form on this device
 *    triggered a second send and they click the old link again), Supabase
 *    reports the flow state as gone — the account is fine, nothing "failed".
 *    Reporting that as `auth_failed` is actively misleading (see GARDEN-27).
 */

// Supabase error codes for a PKCE flow_state that no longer exists because it
// was already consumed, or expired before it was used — neither means the
// exchange failed for a real reason. See @supabase/auth-js `error-codes.ts`.
const BENIGN_FLOW_STATE_CODES = new Set(["flow_state_not_found", "flow_state_expired"]);

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
    // A reused or expired one-time code is not a genuine failure — the most
    // common cause is the user clicking an old email link a second time
    // after an earlier click (or a resent code) already completed sign-in.
    // Telling them "auth failed" here is what made GARDEN-27 look like a
    // broken signup when the account was actually already created and fine.
    if (error?.code && BENIGN_FLOW_STATE_CODES.has(error.code)) {
      return NextResponse.redirect(`${origin}/login?notice=link_already_used`);
    }

    // Genuine failure (network/config error, malformed code, etc.) — most
    // common cause otherwise is a cross-device click, which the
    // magic-callback page handles instead.
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
