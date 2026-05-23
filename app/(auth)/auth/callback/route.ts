import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Auth callback handler — exchanges the PKCE code issued by Supabase
 * for a full session, then routes the user:
 *  - Invite link  → /accept-invite (creates org membership)
 *  - Normal login → /dashboard (or the ?next= param)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.exchangeCodeForSession(code);

    // Detect invite: Supabase stores invite metadata in user_metadata
    const inviteOrgId = data?.user?.user_metadata?.invited_to_org_id as
      | string
      | undefined;

    if (inviteOrgId) {
      return NextResponse.redirect(`${origin}/accept-invite`);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
