import { createSupabaseServerClient } from "@/lib/supabase/server";
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

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    // PKCE exchange failed — most common cause is cross-device click.
    // The magic-callback page handles that case instead.
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Detect invite: Supabase stores invite metadata in user_metadata
  const inviteOrgId = data.user?.user_metadata?.invited_to_org_id as string | undefined;
  if (inviteOrgId) {
    return NextResponse.redirect(`${origin}/accept-invite`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
