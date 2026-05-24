export const runtime = 'edge';
import { NextResponse } from "next/server";

import { serverApiRequest, isServerAuthenticated } from "@/lib/api/server";

interface MeResponse {
  authenticated: boolean;
  user: {
    id: string;
    email: string;
    email_verified: boolean;
    full_name: string | null;
  } | null;
  organization?: {
    id: string;
    name: string;
    slug?: string;
  } | null;
}

export async function GET() {
  try {
    // Check if we have a valid token
    const hasValidToken = await isServerAuthenticated();

    if (!hasValidToken) {
      return NextResponse.json({
        success: true,
        data: {
          authenticated: false,
          user: null,
        },
      });
    }

    // Get user info from backend
    // Try /auth/me first, fallback to /users/me if needed
    try {
      const result = await serverApiRequest<MeResponse>("/auth/me");
      return NextResponse.json({
        success: true,
        data: result.data,
      });
    } catch (error) {
      // Log the error to understand why /auth/me failed
      console.error("[API] /auth/me failed, using fallback:", error);
      
      // Fallback: use /users/me and /auth/session
      const [sessionResult, profileResult] = await Promise.all([
        serverApiRequest<{
          user: {
            id: string;
            email: string;
            full_name: string | null;
            email_verified?: boolean; // Some backends include this in session
          } | null;
          valid: boolean;
        }>("/auth/session").catch(() => ({ data: { user: null, valid: false } })),
        serverApiRequest<{
          profile: {
            id: string;
            email: string;
            full_name: string | null;
          };
          organization: {
            id: string;
            name: string;
            slug: string;
          } | null;
          membership?: {
            id: string;
            organization_id: string;
          } | null;
        }>("/users/me").catch(() => null),
      ]);

      const session = sessionResult.data;
      const profile = profileResult?.data ?? null;

      if (!session?.valid || !session.user) {
        return NextResponse.json({
          success: true,
          data: {
            authenticated: false,
            user: null,
          },
        });
      }

      // If we have a valid session, the user is authenticated
      // In Step-1 auth flow, sessions are typically only issued after email verification
      // So if we have a valid session, we can assume email is verified
      // However, we'll check if the session includes email_verified field first
      const emailVerified = session.user.email_verified ?? 
        // If session doesn't include email_verified, assume true if we have a valid session
        // (Backend typically only issues sessions after verification)
        (session.valid ? true : false);

      return NextResponse.json({
        success: true,
        data: {
          authenticated: true,
          user: {
            id: session.user.id,
            email: session.user.email,
            email_verified: emailVerified,
            full_name: session.user.full_name,
          },
          organization: profile?.organization
            ? {
                id: profile.organization.id,
                name: profile.organization.name,
                slug: profile.organization.slug,
              }
            : null,
        },
      });
    }
  } catch (error) {
    console.error("[API] Me check error:", error);

    // Return unauthenticated rather than error
    return NextResponse.json({
      success: true,
      data: {
        authenticated: false,
        user: null,
      },
    });
  }
}
